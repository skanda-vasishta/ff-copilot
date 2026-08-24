import argparse
import csv
import hashlib
import json
import os
import re
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from espn_api.football import League

load_dotenv()

FANTASY_POSITIONS = frozenset({"QB", "RB", "WR", "TE"})
FFTODAY_POSITION_IDS = {"QB": 10, "RB": 20, "WR": 30, "TE": 40}
FFTODAY_PPR_LEAGUE_ID = 107644
FFTODAY_PROJECTIONS_URL = "https://www.fftoday.com/rankings/playerproj.php"
FANTASYPROS_PPR_RANKINGS_URL = "https://www.fantasypros.com/nfl/rankings/ppr-cheatsheets.php"


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def digest(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), default=str).encode()
    return hashlib.sha256(encoded).hexdigest()


def normalize_text(value: str) -> str:
    lines = [re.sub(r"\s+", " ", line).strip() for line in value.replace("\r", "\n").split("\n")]
    return "\n".join(line for line in lines if line).strip()


def normalize_player_name(value: str) -> str:
    """Normalize provider spelling without making unsafe fuzzy matches."""
    value = value.casefold().replace("’", "'")
    return re.sub(r"[^a-z0-9]", "", value)


def clean_number(value: Any) -> float | int | None:
    if value in (None, "", "nan"):
        return None
    try:
        number = float(value)
        return int(number) if number.is_integer() else number
    except (TypeError, ValueError):
        return None


def parse_json(value: Any, fallback: Any) -> Any:
    if not value:
        return fallback
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return fallback


def chunks(items: list[Any], size: int = 100):
    for index in range(0, len(items), size):
        yield items[index:index + size]


class SupabaseAdmin:
    def __init__(self):
        url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
        self.url = f"{url}/rest/v1"
        self.headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
        self.client = httpx.Client(timeout=30, headers=self.headers)

    def request(self, method: str, table: str, *, params=None, data=None, prefer=None):
        headers = {"Prefer": prefer} if prefer else None
        response = self.client.request(method, f"{self.url}/{table}", params=params, json=data, headers=headers)
        if response.is_error:
            raise RuntimeError(f"Supabase {table} returned {response.status_code}: {response.text[:1000]}")
        return response.json() if response.content else None

    def insert(self, table: str, data: dict | list):
        return self.request("POST", table, data=data, prefer="return=representation")

    def upsert(self, table: str, data: dict | list, conflict: str):
        return self.request("POST", table, params={"on_conflict": conflict}, data=data,
                            prefer="resolution=merge-duplicates,return=representation")

    def select(self, table: str, **filters):
        params = {key: f"eq.{value}" for key, value in filters.items()}
        params["select"] = "*"
        return self.request("GET", table, params=params)

    def patch(self, table: str, filters: dict[str, Any], data: dict):
        return self.request("PATCH", table, params={key: f"eq.{value}" for key, value in filters.items()}, data=data,
                            prefer="return=representation")

    def touch(self, table: str, ids: list[str], fetched_at: str):
        if not ids:
            return []
        return self.request(
            "PATCH",
            table,
            params={"id": f"in.({','.join(ids)})"},
            data={"fetched_at": fetched_at},
            prefer="return=representation",
        )


class ProviderContractError(RuntimeError):
    pass


@dataclass
class Run:
    db: SupabaseAdmin
    kind: str
    season: int
    week: int | None = None
    request_id: str | None = None
    id: str | None = None
    read: int = 0
    written: int = 0
    errors: list[dict[str, str]] = field(default_factory=list)

    def __enter__(self):
        self.id = self.db.insert("sync_runs", {"request_id": self.request_id, "kind": self.kind,
            "provider": "espn", "season": self.season, "week": self.week, "status": "running"})[0]["id"]
        if self.request_id:
            self.db.patch("sync_requests", {"id": self.request_id}, {"status": "running"})
        return self

    def error(self, source: str, exc: Exception | str):
        self.errors.append({"source": source, "error": str(exc)})

    def __exit__(self, exc_type, exc, _tb):
        if exc:
            self.error("run", exc)
        status = "failed" if exc and not self.written else "partial" if self.errors else "succeeded"
        payload = {"status": status, "records_read": self.read, "records_written": self.written,
                   "source_errors": self.errors, "finished_at": now()}
        self.db.patch("sync_runs", {"id": self.id}, payload)
        if self.request_id:
            self.db.patch("sync_requests", {"id": self.request_id}, {
                "status": status, "completed_at": now(), "error": str(exc) if exc else None
            })
        return False


def player_payload(player: Any) -> dict[str, Any]:
    return {
        "name": player.name,
        "position": getattr(player, "position", None),
        "nfl_team": getattr(player, "proTeam", None),
        "updated_at": now(),
    }


def snapshot_payload(player_id: str, player: Any, season: int, week: int | None, fetched_at: str) -> dict[str, Any]:
    raw = {key: getattr(player, key, None) for key in (
        "eligibleSlots", "lineupSlot", "acquisitionType", "stats", "onTeamId"
    )}
    payload = {
        "player_id": player_id, "source": "espn", "season": season, "week": week,
        "position_rank": getattr(player, "posRank", None), "injury_status": getattr(player, "injuryStatus", None),
        "injured": getattr(player, "injured", None), "total_points": getattr(player, "total_points", None),
        "average_points": getattr(player, "avg_points", None),
        "projected_total_points": getattr(player, "projected_total_points", None),
        "projected_average_points": getattr(player, "projected_avg_points", None),
        "percent_owned": getattr(player, "percent_owned", None), "percent_started": getattr(player, "percent_started", None),
        "raw_payload": raw, "fetched_at": fetched_at,
    }
    payload["data_hash"] = digest({key: value for key, value in payload.items() if key != "fetched_at"})
    return payload


def resolve_player(db: SupabaseAdmin, external_id: str, payload: dict[str, Any]) -> str:
    ids = db.select("player_external_ids", provider="espn", external_id=external_id)
    if ids:
        db.patch("players", {"id": ids[0]["player_id"]}, payload)
        return ids[0]["player_id"]
    player_id = db.insert("players", payload)[0]["id"]
    db.insert("player_external_ids", {"player_id": player_id, "provider": "espn", "external_id": external_id})
    return player_id


def parse_fantasypros_html(html: str) -> str:
    content = "\n".join(p.get_text(" ", strip=True) for p in BeautifulSoup(html, "html.parser").find_all("p"))
    if not content.strip():
        raise ProviderContractError("FantasyPros player notes markup returned no paragraph content")
    return content


def fantasypros_text(name: str) -> tuple[str, str]:
    slug = re.sub(r"[^a-zA-Z0-9\s]", "", name).replace(" ", "-").lower()
    aliases = {"Kenneth Walker III": "kenneth-walker-rb", "Amon-Ra St. Brown": "amonra-stbrown"}
    url = f"https://www.fantasypros.com/nfl/notes/{aliases.get(name, slug)}.php"
    response = httpx.get(url, timeout=15, follow_redirects=True)
    response.raise_for_status()
    return url, parse_fantasypros_html(response.text)


def parse_espn_html(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    node = soup.find("div", class_="FantasyOverview__News")
    content = node.get_text("\n", strip=True) if node else ""
    if not content:
        raise ProviderContractError("ESPN player page is missing FantasyOverview__News")
    return content


def parse_espn_draft_rank(player: dict[str, Any], scoring_format: str = "PPR") -> int | None:
    ranks = player.get("draftRanksByRankType") or {}
    requested = ranks.get(scoring_format.upper()) or ranks.get("PPR") or ranks.get("STANDARD") or {}
    return clean_number(requested.get("rank"))


def parse_fftoday_projections(html: str, position: str, source_url: str) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    expected_title = f"{position}" if position == "QB" else None
    update_node = soup.find(class_="update")
    updated_match = re.search(r"Updated:\s*(\d{1,2}/\d{1,2}/\d{4})", update_node.get_text(" ", strip=True) if update_node else "")
    source_updated_at = None
    if updated_match:
        source_updated_at = datetime.strptime(updated_match.group(1), "%m/%d/%Y").replace(tzinfo=timezone.utc).isoformat()

    rows = []
    for link in soup.select('a[href^="/stats/players/"]'):
        match = re.search(r"/stats/players/(\d+)/", link.get("href", ""))
        cells = link.find_parent("tr").find_all("td") if link.find_parent("tr") else []
        if not match or len(cells) < 7:
            continue
        values = [cell.get_text(" ", strip=True).replace(",", "") for cell in cells]
        points = clean_number(values[-1])
        if points is None:
            raise ProviderContractError(f"FFToday {position} row for {link.get_text(strip=True)} has no fantasy points")
        rows.append({
            "external_id": match.group(1),
            "name": link.get_text(" ", strip=True),
            "position": position,
            "nfl_team": values[2] or None,
            "position_rank": len(rows) + 1,
            "projected_total_points": points,
            "source_updated_at": source_updated_at,
            "source_url": source_url,
            "raw_values": values[4:-1],
        })
    if len(rows) < 10:
        detail = f" for {expected_title}" if expected_title else ""
        raise ProviderContractError(f"FFToday projection markup returned only {len(rows)} player rows{detail}")
    return rows


def fftoday_projections(season: int) -> list[dict[str, Any]]:
    rows = []
    headers = {"User-Agent": "ff-copilot/1.0 (open-source fantasy football app; once-daily attributed fetch)"}
    with httpx.Client(timeout=30, follow_redirects=True, headers=headers) as client:
        for position, position_id in FFTODAY_POSITION_IDS.items():
            params = {"Season": season, "PosID": position_id, "LeagueID": FFTODAY_PPR_LEAGUE_ID}
            response = client.get(FFTODAY_PROJECTIONS_URL, params=params)
            response.raise_for_status()
            rows.extend(parse_fftoday_projections(response.text, position, str(response.url)))
    for overall_rank, row in enumerate(
        sorted(rows, key=lambda item: (-float(item["projected_total_points"]), item["name"])), start=1
    ):
        row["overall_rank"] = overall_rank
    return rows


def parse_fantasypros_rankings(html: str, season: int, source_url: str) -> list[dict[str, Any]]:
    match = re.search(r"\bvar\s+ecrData\s*=\s*(\{.*?\});\s*\n", html, re.DOTALL)
    if not match:
        raise ProviderContractError("FantasyPros rankings page is missing ecrData")
    try:
        payload = json.loads(match.group(1))
    except json.JSONDecodeError as exc:
        raise ProviderContractError("FantasyPros ecrData is not valid JSON") from exc
    if str(payload.get("year")) != str(season) or payload.get("scoring") != "PPR":
        raise ProviderContractError(
            f"FantasyPros returned {payload.get('year')} {payload.get('scoring')} instead of {season} PPR"
        )
    source_updated_at = None
    updated_match = re.fullmatch(r"(\d{1,2})/(\d{1,2})", str(payload.get("last_updated", "")))
    if updated_match:
        source_updated_at = datetime(
            season, int(updated_match.group(1)), int(updated_match.group(2)), tzinfo=timezone.utc
        ).isoformat()
    rows = []
    for player in payload.get("players", []):
        position = player.get("player_position_id")
        overall_rank = clean_number(player.get("rank_ecr"))
        position_match = re.search(r"(\d+)$", str(player.get("pos_rank", "")))
        if position not in FANTASY_POSITIONS or overall_rank is None or not position_match:
            continue
        rows.append({
            "external_id": str(player["player_id"]),
            "name": player["player_name"],
            "position": position,
            "nfl_team": player.get("player_team_id"),
            "overall_rank": overall_rank,
            "position_rank": int(position_match.group(1)),
            "source_updated_at": source_updated_at,
            "source_url": player.get("player_page_url") or source_url,
        })
    if len(rows) < 100:
        raise ProviderContractError(f"FantasyPros rankings returned only {len(rows)} offensive players")
    return rows


def fantasypros_rankings(season: int) -> list[dict[str, Any]]:
    response = httpx.get(
        FANTASYPROS_PPR_RANKINGS_URL,
        timeout=30,
        follow_redirects=True,
        headers={"User-Agent": "ff-copilot/1.0 (open-source fantasy football app; once-daily attributed fetch)"},
    )
    response.raise_for_status()
    return parse_fantasypros_rankings(response.text, season, str(response.url))


def espn_draft_ranks(league: League, size: int, scoring_format: str = "PPR") -> dict[str, int]:
    filters = {"players": {
        "filterStatus": {"value": ["FREEAGENT", "WAIVERS", "ONTEAM"]},
        "limit": size,
        "sortDraftRanks": {"sortPriority": 1, "sortAsc": True, "value": scoring_format.upper()},
    }}
    data = league.espn_request.league_get(
        params={"view": "kona_player_info", "scoringPeriodId": league.current_week},
        headers={"x-fantasy-filter": json.dumps(filters)},
    )
    result = {}
    for entry in data.get("players", []):
        player = entry.get("playerPoolEntry", {}).get("player") or entry.get("player") or {}
        rank = parse_espn_draft_rank(player, scoring_format)
        if player.get("id") is not None and rank is not None:
            result[str(player["id"])] = int(rank)
    if not result:
        raise ProviderContractError("ESPN player pool returned no current draft rankings")
    return result


def espn_text(external_id: str, name: str) -> tuple[str, str]:
    slug = re.sub(r"[^a-zA-Z0-9\s]", "", name).replace(" ", "-").lower()
    url = f"https://www.espn.com/nfl/player/_/id/{external_id}/{slug}"
    response = httpx.get(url, timeout=15, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0"})
    response.raise_for_status()
    return url, parse_espn_html(response.text)


def reddit_documents(name: str) -> list[dict[str, Any]]:
    import praw
    client_id, secret = os.getenv("REDDIT_CLIENT"), os.getenv("REDDIT_SECRET")
    if not client_id or not secret:
        raise RuntimeError("Reddit credentials are not configured")
    reddit = praw.Reddit(client_id=client_id, client_secret=secret, user_agent="ff-copilot-bot/1.0")
    documents = []
    for post in reddit.subreddit("fantasyfootball").search(name, limit=3, sort="relevance", time_filter="month"):
        post.comments.replace_more(limit=0)
        comments = "\n".join(f"- {comment.body}" for comment in post.comments.list()[:5])
        documents.append({"source": "reddit", "external_document_id": post.id, "title": post.title,
                          "content": normalize_text(f"Post\n{post.selftext}\n\nTop comments\n{comments}"),
                          "source_url": f"https://www.reddit.com{post.permalink}",
                          "published_at": datetime.fromtimestamp(post.created_utc, timezone.utc).isoformat(),
                          "metadata": {"subreddit": str(post.subreddit), "score": post.score,
                                       "comment_count": post.num_comments, "outbound_url": post.url}})
    return documents


def collect_documents(
    player_id: str,
    external_id: str,
    name: str,
    fetched_at: str,
    requested_sources: set[str],
):
    providers = []
    errors = []
    loaders = {
        "fantasypros": lambda: [dict(zip(("source_url", "content"), fantasypros_text(name)))],
        "espn": lambda: [dict(zip(("source_url", "content"), espn_text(external_id, name)))],
        "reddit": lambda: reddit_documents(name),
    }
    for source in requested_sources:
        attempts = 3 if source == "reddit" else 1
        for attempt in range(attempts):
            try:
                for document in loaders[source]():
                    if not document.get("content"):
                        continue
                    document["content"] = normalize_text(document["content"])
                    document.setdefault("title", f"{source.title()} update for {name}")
                    providers.append({"player_id": player_id, "source": source, "fetched_at": fetched_at,
                                      "content_hash": digest(document.get("content", "")), **document})
                break
            except Exception as exc:
                rate_limited = "429" in str(exc) or "rate limit" in str(exc).lower()
                if source == "reddit" and rate_limited and attempt < attempts - 1:
                    time.sleep(10 * (attempt + 1))
                    continue
                errors.append((f"{source}:{name}", exc))
                break
    return providers, errors


def source_priority(item: tuple[str, Any]) -> tuple[float, float, str]:
    _external_id, player = item
    owned = clean_number(getattr(player, "percent_owned", None)) or 0
    position_rank = clean_number(getattr(player, "posRank", None))
    return (-float(owned), float(position_rank or 10_000), player.name)


def sync_global(args):
    db = SupabaseAdmin()
    with Run(db, "global", args.season, args.week) as run:
        league = League(league_id=int(args.league_id), year=args.season)
        fetched_at = now()
        candidates = [player for team in league.teams for player in team.roster]
        candidates.extend(league.free_agents(size=args.free_agents))
        unique = {
            str(player.playerId): player
            for player in candidates
            if getattr(player, "position", None) in FANTASY_POSITIONS
        }
        draft_ranks = espn_draft_ranks(league, args.free_agents, "PPR")
        run.read = len(unique)
        external_rows = db.request("GET", "player_external_ids", params={
            "provider": "eq.espn", "select": "external_id,player_id", "limit": 1000
        })
        existing = {row["external_id"]: row["player_id"] for row in external_rows}
        player_rows, id_rows, snapshots, rankings = [], [], [], []
        resolved: dict[str, str] = {}
        for external_id, player in unique.items():
            player_id = existing.get(external_id, str(uuid.uuid4()))
            resolved[external_id] = player_id
            player_rows.append({"id": player_id, **player_payload(player)})
            id_rows.append({"player_id": player_id, "provider": "espn", "external_id": external_id})
            snapshots.append(snapshot_payload(player_id, player, args.season, args.week, fetched_at))
            if external_id in draft_ranks:
                rankings.append({"player_id": player_id, "source": "espn", "season": args.season,
                    "week": args.week, "scoring_format": "ppr", "ranking_type": "current_draft_rank",
                    "overall_rank": draft_ranks[external_id], "position_rank": None, "fetched_at": fetched_at})
            if getattr(player, "posRank", None) is not None:
                preseason = not (clean_number(getattr(player, "total_points", None)) or 0)
                rankings.append({"player_id": player_id, "source": "espn", "season": args.season,
                    "week": args.week, "scoring_format": "league",
                    "ranking_type": "previous_season_position_finish" if preseason else "season_to_date_position_rank",
                    "overall_rank": None, "position_rank": player.posRank, "fetched_at": fetched_at})

        for batch in chunks(player_rows):
            db.upsert("players", batch, "id")
        for batch in chunks(id_rows):
            db.upsert("player_external_ids", batch, "provider,external_id")
        for batch in chunks(snapshots, 50):
            persisted = db.upsert("player_snapshots", batch, "player_id,source,season,week,data_hash")
            # A matching data hash means the facts are unchanged, not that they
            # were last checked on the original insert date. PostgREST can return
            # the existing row without advancing fetched_at for this nullable
            # conflict key, so touch every successfully observed snapshot.
            db.touch("player_snapshots", [row["id"] for row in persisted], fetched_at)
        for batch in chunks(rankings):
            persisted = db.upsert("player_rankings", batch,
                                  "player_id,source,season,week,scoring_format,ranking_type,overall_rank,position_rank")
            db.touch("player_rankings", [row["id"] for row in persisted], fetched_at)
        run.written += len(player_rows) + len(id_rows) + len(snapshots) + len(rankings)

        if args.fantasypros_rankings:
            try:
                fantasypros_rows = fantasypros_rankings(args.season)
                player_lookup = {
                    (normalize_player_name(row["name"]), row.get("position")): row["id"]
                    for row in player_rows
                }
                fantasypros_ids, fantasypros_ranking_rows = [], []
                unmatched = []
                for row in fantasypros_rows:
                    player_id = player_lookup.get((normalize_player_name(row["name"]), row["position"]))
                    if not player_id:
                        unmatched.append(f"{row['name']} ({row['position']})")
                        continue
                    fantasypros_ids.append({
                        "player_id": player_id, "provider": "fantasypros", "external_id": row["external_id"]
                    })
                    fantasypros_ranking_rows.append({
                        "player_id": player_id, "source": "fantasypros", "season": args.season,
                        "week": args.week, "scoring_format": "ppr", "ranking_type": "expert_consensus_rank",
                        "overall_rank": row["overall_rank"], "position_rank": row["position_rank"],
                        "fetched_at": fetched_at,
                    })
                if len(fantasypros_ranking_rows) < 100:
                    raise ProviderContractError(
                        f"FantasyPros matched only {len(fantasypros_ranking_rows)} players; refusing partial import"
                    )
                for batch in chunks(fantasypros_ids):
                    db.upsert("player_external_ids", batch, "provider,external_id")
                for batch in chunks(fantasypros_ranking_rows):
                    persisted = db.upsert(
                        "player_rankings", batch,
                        "player_id,source,season,week,scoring_format,ranking_type,overall_rank,position_rank",
                    )
                    db.touch("player_rankings", [item["id"] for item in persisted], fetched_at)
                run.read += len(fantasypros_rows)
                run.written += len(fantasypros_ids) + len(fantasypros_ranking_rows)
                if unmatched:
                    run.error(
                        "fantasypros_rankings:unmatched",
                        f"{len(unmatched)} unmatched players: {', '.join(unmatched[:20])}",
                    )
            except Exception as exc:
                run.error("fantasypros_rankings", exc)

        if args.fftoday:
            try:
                fftoday_rows = fftoday_projections(args.season)
                player_lookup = {
                    (normalize_player_name(row["name"]), row.get("position")): row["id"]
                    for row in player_rows
                }
                fftoday_ids, fftoday_snapshots, fftoday_rankings = [], [], []
                unmatched = []
                for row in fftoday_rows:
                    player_id = player_lookup.get((normalize_player_name(row["name"]), row["position"]))
                    if not player_id:
                        unmatched.append(f"{row['name']} ({row['position']})")
                        continue
                    fftoday_ids.append({
                        "player_id": player_id, "provider": "fftoday", "external_id": row["external_id"]
                    })
                    raw_payload = {
                        "attribution": "FFToday",
                        "source_url": row["source_url"],
                        "scoring_format": "ppr",
                        "position": row["position"],
                        "nfl_team": row["nfl_team"],
                        "stat_values": row["raw_values"],
                    }
                    snapshot = {
                        "player_id": player_id, "source": "fftoday", "season": args.season, "week": args.week,
                        "projected_total_points": row["projected_total_points"],
                        "raw_payload": raw_payload, "source_updated_at": row["source_updated_at"],
                        "fetched_at": fetched_at,
                    }
                    snapshot["data_hash"] = digest({key: value for key, value in snapshot.items() if key != "fetched_at"})
                    fftoday_snapshots.append(snapshot)
                    fftoday_rankings.append({
                        "player_id": player_id, "source": "fftoday", "season": args.season, "week": args.week,
                        "scoring_format": "ppr", "ranking_type": "projected_position_rank",
                        "overall_rank": None, "position_rank": row["position_rank"], "fetched_at": fetched_at,
                    })
                if len(fftoday_snapshots) < 100:
                    raise ProviderContractError(
                        f"FFToday matched only {len(fftoday_snapshots)} players; refusing partial provider import"
                    )
                for batch in chunks(fftoday_ids):
                    db.upsert("player_external_ids", batch, "provider,external_id")
                for batch in chunks(fftoday_snapshots, 50):
                    persisted = db.upsert("player_snapshots", batch, "player_id,source,season,week,data_hash")
                    db.touch("player_snapshots", [item["id"] for item in persisted], fetched_at)
                for batch in chunks(fftoday_rankings):
                    persisted = db.upsert(
                        "player_rankings", batch,
                        "player_id,source,season,week,scoring_format,ranking_type,overall_rank,position_rank",
                    )
                    db.touch("player_rankings", [item["id"] for item in persisted], fetched_at)
                run.read += len(fftoday_rows)
                run.written += len(fftoday_ids) + len(fftoday_snapshots) + len(fftoday_rankings)
                if unmatched:
                    run.error("fftoday:unmatched", f"{len(unmatched)} unmatched players: {', '.join(unmatched[:20])}")
            except Exception as exc:
                # Keep the last successful FFToday snapshot when its page or network fails.
                run.error("fftoday", exc)

        if args.sources:
            source_candidates = sorted(unique.items(), key=source_priority)[:args.source_player_limit]
            requested_sources = set(args.document_sources)
            document_buffer: list[dict[str, Any]] = []

            def flush_documents():
                while document_buffer:
                    batch = document_buffer[:20]
                    del document_buffer[:20]
                    try:
                        db.upsert("source_documents", batch, "player_id,source,content_hash")
                        run.written += len(batch)
                    except Exception:
                        for document in batch:
                            try:
                                db.upsert("source_documents", document, "player_id,source,content_hash")
                                run.written += 1
                            except Exception as row_exc:
                                run.error(f"source_documents:{document['source']}:{document['player_id']}", row_exc)

            with ThreadPoolExecutor(max_workers=args.source_workers) as pool:
                futures = {
                    pool.submit(
                        collect_documents,
                        resolved[external_id],
                        external_id,
                        player.name,
                        fetched_at,
                        requested_sources,
                    ): player.name
                    for external_id, player in source_candidates
                }
                for future in as_completed(futures):
                    try:
                        collected, errors = future.result()
                        document_buffer.extend(collected)
                        for source, exc in errors:
                            run.error(source, exc)
                        if len(document_buffer) >= 20:
                            flush_documents()
                    except Exception as exc:
                        run.error(f"sources:{futures[future]}", exc)
            flush_documents()


def coverage_report(args):
    db = SupabaseAdmin()
    snapshots = db.request("GET", "player_snapshots", params={
        "season": f"eq.{args.season}", "select": "player_id,source,fetched_at", "limit": 10000
    })
    rankings = db.request("GET", "player_rankings", params={
        "season": f"eq.{args.season}", "select": "player_id,source,fetched_at", "limit": 10000
    })
    documents = db.request("GET", "source_documents", params={
        "select": "player_id,source,fetched_at", "limit": 10000
    })
    runs = db.request("GET", "sync_runs", params={
        "season": f"eq.{args.season}", "select": "status,records_read,records_written,source_errors,started_at,finished_at",
        "order": "started_at.desc", "limit": 1
    })

    def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
        by_source: dict[str, set[str]] = {}
        latest = None
        for row in rows:
            by_source.setdefault(row["source"], set()).add(row["player_id"])
            latest = max(latest or row["fetched_at"], row["fetched_at"])
        return {"players_by_source": {key: len(value) for key, value in sorted(by_source.items())},
                "latest_fetched_at": latest}

    report = {"season": args.season, "snapshots": summarize(snapshots), "rankings": summarize(rankings),
              "documents": summarize(documents), "latest_run": runs[0] if runs else None}
    print(json.dumps(report, indent=2, sort_keys=True))
    if args.minimum_players and len({row["player_id"] for row in snapshots}) < args.minimum_players:
        raise SystemExit(f"Coverage below minimum of {args.minimum_players} players")
    if args.maximum_snapshot_age_hours:
        latest_snapshot = report["snapshots"]["latest_fetched_at"]
        if not latest_snapshot:
            raise SystemExit("No player snapshot freshness timestamp is available")
        fetched_at = datetime.fromisoformat(latest_snapshot.replace("Z", "+00:00"))
        age_hours = (datetime.now(timezone.utc) - fetched_at).total_seconds() / 3600
        if age_hours > args.maximum_snapshot_age_hours:
            raise SystemExit(
                f"Latest player snapshot is {age_hours:.1f} hours old; "
                f"maximum is {args.maximum_snapshot_age_hours:.1f}"
            )


def sync_one_league(db: SupabaseAdmin, external_id: str, season: int, week: int | None, request_id: str | None = None):
    with Run(db, "league", season, week, request_id) as run:
        league_data = League(league_id=int(external_id), year=season)
        fetched_at = now()
        settings = league_data.settings
        raw_settings = json.loads(json.dumps(vars(settings), default=str))
        scoring_rules = getattr(settings, "scoring_format", []) or []
        reception_points = next((rule.get("points") for rule in scoring_rules if rule.get("abbr") == "REC"), None)
        scoring_label = (
            "ppr" if reception_points == 1 else
            "half_ppr" if reception_points == 0.5 else
            "standard" if reception_points == 0 else
            "custom"
        )
        lineup_counts = {
            str(slot): count for slot, count in (getattr(settings, "position_slot_counts", {}) or {}).items()
            if count
        }
        league = db.upsert("leagues", {"provider": "espn", "external_id": external_id, "season": season,
            "name": getattr(settings, "name", None), "status": "succeeded", "last_synced_at": fetched_at,
            "team_count": getattr(settings, "team_count", None),
            "playoff_team_count": getattr(settings, "playoff_team_count", None),
            "regular_season_weeks": getattr(settings, "reg_season_count", None),
            "scoring_type": getattr(settings, "scoring_type", None),
            "reception_points": reception_points, "scoring_format_label": scoring_label,
            "lineup_slot_counts": lineup_counts, "league_settings": raw_settings},
            "provider,external_id,season")[0]
        for team in league_data.teams:
            db_team = db.upsert("fantasy_teams", {"league_id": league["id"], "external_id": str(team.team_id),
                "name": team.team_name, "updated_at": fetched_at,
                "wins": getattr(team, "wins", None), "losses": getattr(team, "losses", None),
                "ties": getattr(team, "ties", None), "points_for": getattr(team, "points_for", None),
                "points_against": getattr(team, "points_against", None),
                "standing": getattr(team, "standing", None),
                "final_standing": getattr(team, "final_standing", None),
                "playoff_pct": getattr(team, "playoff_pct", None)}, "league_id,external_id")[0]
            roster_key = [{"id": str(player.playerId), "slot": getattr(player, "lineupSlot", None)} for player in team.roster]
            roster = db.upsert("roster_snapshots", {"team_id": db_team["id"], "season": season, "week": week,
                "fetched_at": fetched_at, "data_hash": digest(roster_key)}, "team_id,season,week,data_hash")[0]
            rows = []
            for player in team.roster:
                player_id = resolve_player(db, str(player.playerId), player_payload(player))
                rows.append({"roster_snapshot_id": roster["id"], "player_id": player_id,
                             "lineup_slot": getattr(player, "lineupSlot", None),
                             "acquisition_type": getattr(player, "acquisitionType", None)})
            if rows:
                db.upsert("roster_players", rows, "roster_snapshot_id,player_id")
            run.read += len(team.roster)
            run.written += len(rows) + 2
        if request_id:
            request = db.select("sync_requests", id=request_id)[0]
            if request.get("requested_by"):
                db.upsert("user_leagues", {"user_id": request["requested_by"], "league_id": league["id"]},
                          "user_id,league_id")


def sync_league(args):
    db = SupabaseAdmin()
    if args.all_linked:
        leagues = db.request("GET", "leagues", params={
            "provider": "eq.espn", "season": f"eq.{args.season}",
            "select": "external_id", "order": "external_id.asc",
        })
        failures = []
        for league in leagues:
            try:
                sync_one_league(db, league["external_id"], args.season, args.week)
            except Exception as exc:
                failures.append((league["external_id"], str(exc)))
                print(f"Failed league {league['external_id']}: {exc}", file=sys.stderr)
        if failures:
            raise SystemExit(f"{len(failures)} linked league sync(s) failed")
    elif args.pending:
        requests = db.request("GET", "sync_requests", params={"status": "eq.pending", "kind": "eq.league",
            "select": "*", "order": "requested_at.asc"})
        grouped: dict[tuple[str, str, int, int | None], list[dict[str, Any]]] = {}
        for request in requests:
            grouped.setdefault((request["provider"], request["external_id"], request["season"], request.get("week")), []).append(request)
        for (_provider, external_id, season, week), group in grouped.items():
            primary = group[0]
            try:
                sync_one_league(db, external_id, season, week, primary["id"])
                leagues = db.select("leagues", provider="espn", external_id=external_id, season=season)
                for duplicate in group[1:]:
                    if leagues and duplicate.get("requested_by"):
                        db.upsert("user_leagues", {"user_id": duplicate["requested_by"], "league_id": leagues[0]["id"]},
                                  "user_id,league_id")
                    db.patch("sync_requests", {"id": duplicate["id"]}, {
                        "status": "succeeded", "completed_at": now(), "error": None
                    })
            except Exception as exc:
                for duplicate in group[1:]:
                    db.patch("sync_requests", {"id": duplicate["id"]}, {
                        "status": "failed", "completed_at": now(), "error": str(exc)
                    })
                print(f"Failed request group {primary['id']}: {exc}", file=sys.stderr)
    elif args.league_id:
        sync_one_league(db, args.league_id, args.season, args.week)
    else:
        raise SystemExit("Provide --league-id, --pending, or --all-linked")


def import_legacy(args):
    db = SupabaseAdmin()
    fetched_at = now()
    stats_path, sources_path = Path(args.stats), Path(args.sources)
    with Run(db, "legacy_import", args.season) as run:
        with stats_path.open(newline="", encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                run.read += 1
                player_id = resolve_player(db, row["playerId"], {"name": row["name"], "position": row.get("position"),
                    "nfl_team": row.get("proTeam"), "updated_at": fetched_at})
                raw_stats = parse_json(row.get("stats"), {})
                snapshot = {"player_id": player_id, "source": "espn", "season": args.season,
                    "position_rank": clean_number(row.get("posRank")), "injury_status": row.get("injuryStatus"),
                    "injured": row.get("injured", "").lower() == "true", "total_points": clean_number(row.get("total_points")),
                    "average_points": clean_number(row.get("avg_points")),
                    "projected_total_points": clean_number(row.get("projected_total_points")),
                    "projected_average_points": clean_number(row.get("projected_avg_points")),
                    "percent_owned": clean_number(row.get("percent_owned")), "percent_started": clean_number(row.get("percent_started")),
                    "raw_payload": {"stats": raw_stats, "eligibleSlots": parse_json(row.get("eligibleSlots"), [])},
                    "fetched_at": fetched_at}
                snapshot["data_hash"] = digest({key: value for key, value in snapshot.items() if key != "fetched_at"})
                db.upsert("player_snapshots", snapshot, "player_id,source,season,week,data_hash")
                run.written += 1
        if sources_path.exists():
            with sources_path.open(newline="", encoding="utf-8") as handle:
                for row in csv.DictReader(handle):
                    ids = db.select("player_external_ids", provider="espn", external_id=row["playerId"])
                    if not ids:
                        continue
                    documents = []
                    for source, field in (("reddit", "reddit_text"), ("fantasypros", "fantasy_pros_text"), ("espn", "espn_text")):
                        if row.get(field):
                            documents.append({"player_id": ids[0]["player_id"], "source": source,
                                              "content": row[field], "fetched_at": fetched_at,
                                              "content_hash": digest(row[field]), "metadata": {"legacy_import": True}})
                    if documents:
                        db.upsert("source_documents", documents, "player_id,source,content_hash")
                        run.written += len(documents)


def parser():
    root = argparse.ArgumentParser(description="FF Copilot Supabase ingestion")
    commands = root.add_subparsers(required=True)
    legacy = commands.add_parser("import-legacy")
    legacy.add_argument("--season", type=int, default=2025)
    legacy.add_argument("--stats", default="archive/legacy-2025/data/player_stats.csv")
    legacy.add_argument("--sources", default="archive/legacy-2025/data/player_scraped_info.csv")
    legacy.set_defaults(func=import_legacy)
    global_sync = commands.add_parser("sync-global")
    global_sync.add_argument("--season", type=int, required=True)
    global_sync.add_argument("--week", type=int)
    global_sync.add_argument("--league-id", default=os.getenv("ESPN_SEED_LEAGUE_ID"), required=not bool(os.getenv("ESPN_SEED_LEAGUE_ID")))
    global_sync.add_argument(
        "--free-agents",
        type=int,
        default=2000,
        help="Maximum ESPN free-agent pool to request before filtering to QB/RB/WR/TE (default: 2000)",
    )
    global_sync.add_argument("--sources", action="store_true")
    global_sync.add_argument(
        "--fftoday", action="store_true",
        help="Refresh attributed FFToday full-PPR projections and projected positional ranks",
    )
    global_sync.add_argument(
        "--fantasypros-rankings", action="store_true",
        help="Refresh attributed FantasyPros full-PPR overall and positional ECR",
    )
    global_sync.add_argument("--source-workers", type=int, default=4)
    global_sync.add_argument(
        "--source-player-limit", type=int, default=450,
        help="Maximum high-ownership/ranked players to enrich with source documents (default: 450)",
    )
    global_sync.add_argument(
        "--document-sources", nargs="+", choices=("espn", "fantasypros", "reddit"),
        default=("espn", "fantasypros", "reddit"),
        help="Source document providers to refresh",
    )
    global_sync.set_defaults(func=sync_global)
    coverage = commands.add_parser("coverage-report")
    coverage.add_argument("--season", type=int, required=True)
    coverage.add_argument("--minimum-players", type=int, default=0)
    coverage.add_argument(
        "--maximum-snapshot-age-hours",
        type=float,
        default=0,
        help="Fail when the newest player snapshot is older than this many hours (0 disables the check)",
    )
    coverage.set_defaults(func=coverage_report)
    league_sync = commands.add_parser("sync-league")
    league_sync.add_argument("--season", type=int, default=datetime.now().year)
    league_sync.add_argument("--week", type=int)
    league_sync.add_argument("--league-id")
    league_sync.add_argument("--pending", action="store_true")
    league_sync.add_argument("--all-linked", action="store_true")
    league_sync.set_defaults(func=sync_league)
    return root


if __name__ == "__main__":
    args = parser().parse_args()
    args.func(args)
