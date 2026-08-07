import argparse
import csv
import hashlib
import json
import os
import re
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from espn_api.football import League

load_dotenv()


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def digest(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), default=str).encode()
    return hashlib.sha256(encoded).hexdigest()


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
        response.raise_for_status()
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


def fantasypros_text(name: str) -> tuple[str, str]:
    slug = re.sub(r"[^a-zA-Z0-9\s]", "", name).replace(" ", "-").lower()
    aliases = {"Kenneth Walker III": "kenneth-walker-rb", "Amon-Ra St. Brown": "amonra-stbrown"}
    url = f"https://www.fantasypros.com/nfl/notes/{aliases.get(name, slug)}.php"
    response = httpx.get(url, timeout=15, follow_redirects=True)
    response.raise_for_status()
    content = "\n".join(p.get_text(" ", strip=True) for p in BeautifulSoup(response.text, "html.parser").find_all("p"))
    return url, content


def espn_text(external_id: str, name: str) -> tuple[str, str]:
    slug = re.sub(r"[^a-zA-Z0-9\s]", "", name).replace(" ", "-").lower()
    url = f"https://www.espn.com/nfl/player/_/id/{external_id}/{slug}"
    response = httpx.get(url, timeout=15, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0"})
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    node = soup.find("div", class_="FantasyOverview__News")
    return url, node.get_text("\n", strip=True) if node else ""


def reddit_documents(name: str) -> list[dict[str, Any]]:
    import praw
    client_id, secret = os.getenv("REDDIT_CLIENT"), os.getenv("REDDIT_SECRET")
    if not client_id or not secret:
        raise RuntimeError("Reddit credentials are not configured")
    reddit = praw.Reddit(client_id=client_id, client_secret=secret, user_agent="ff-copilot-bot/1.0")
    documents = []
    for post in reddit.subreddit("fantasyfootball").search(name, limit=3, sort="relevance", time_filter="month"):
        post.comments.replace_more(limit=0)
        comments = "\n".join(comment.body for comment in post.comments.list()[:5])
        documents.append({"source": "reddit", "external_document_id": post.id, "title": post.title,
                          "content": f"{post.selftext}\n{comments}".strip(), "source_url": post.url})
    return documents


def insert_documents(db: SupabaseAdmin, player_id: str, external_id: str, name: str, fetched_at: str, run: Run):
    providers = []
    for source, loader in (("fantasypros", lambda: [dict(zip(("source_url", "content"), fantasypros_text(name)))]),
                           ("espn", lambda: [dict(zip(("source_url", "content"), espn_text(external_id, name)))]),
                           ("reddit", lambda: reddit_documents(name))):
        try:
            for document in loader():
                if not document.get("content"):
                    continue
                providers.append({"player_id": player_id, "source": source, "fetched_at": fetched_at,
                                  "content_hash": digest(document.get("content", "")), **document})
        except Exception as exc:
            run.error(f"{source}:{name}", exc)
    if providers:
        db.upsert("source_documents", providers, "player_id,source,content_hash")
        run.written += len(providers)


def sync_global(args):
    db = SupabaseAdmin()
    league = League(league_id=int(args.league_id), year=args.season)
    fetched_at = now()
    unique = {str(player.playerId): player for team in league.teams for player in team.roster}
    unique.update({str(player.playerId): player for player in league.free_agents(size=args.free_agents)})
    with Run(db, "global", args.season, args.week) as run:
        run.read = len(unique)
        for external_id, player in unique.items():
            player_id = resolve_player(db, external_id, player_payload(player))
            db.upsert("player_snapshots", snapshot_payload(player_id, player, args.season, args.week, fetched_at),
                      "player_id,source,season,week,data_hash")
            if getattr(player, "posRank", None) is not None:
                db.upsert("player_rankings", {"player_id": player_id, "source": "espn", "season": args.season,
                    "week": args.week, "scoring_format": "league", "ranking_type": "position",
                    "position_rank": player.posRank, "fetched_at": fetched_at},
                    "player_id,source,season,week,scoring_format,ranking_type,overall_rank,position_rank")
            run.written += 1
            if args.sources:
                insert_documents(db, player_id, external_id, player.name, fetched_at, run)


def sync_one_league(db: SupabaseAdmin, external_id: str, season: int, week: int | None, request_id: str | None = None):
    league_data = League(league_id=int(external_id), year=season)
    fetched_at = now()
    with Run(db, "league", season, week, request_id) as run:
        league = db.upsert("leagues", {"provider": "espn", "external_id": external_id, "season": season,
            "name": getattr(league_data.settings, "name", None), "status": "succeeded", "last_synced_at": fetched_at},
            "provider,external_id,season")[0]
        for team in league_data.teams:
            db_team = db.upsert("fantasy_teams", {"league_id": league["id"], "external_id": str(team.team_id),
                "name": team.team_name, "updated_at": fetched_at}, "league_id,external_id")[0]
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
    if args.pending:
        requests = db.request("GET", "sync_requests", params={"status": "eq.pending", "kind": "eq.league",
            "select": "*", "order": "requested_at.asc"})
        for request in requests:
            try:
                sync_one_league(db, request["external_id"], request["season"], request.get("week"), request["id"])
            except Exception as exc:
                print(f"Failed request {request['id']}: {exc}", file=sys.stderr)
    elif args.league_id:
        sync_one_league(db, args.league_id, args.season, args.week)
    else:
        raise SystemExit("Provide --league-id or --pending")


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
    legacy.add_argument("--stats", default="data/player_stats.csv")
    legacy.add_argument("--sources", default="data/player_scraped_info.csv")
    legacy.set_defaults(func=import_legacy)
    global_sync = commands.add_parser("sync-global")
    global_sync.add_argument("--season", type=int, required=True)
    global_sync.add_argument("--week", type=int)
    global_sync.add_argument("--league-id", default=os.getenv("ESPN_SEED_LEAGUE_ID"), required=not bool(os.getenv("ESPN_SEED_LEAGUE_ID")))
    global_sync.add_argument("--free-agents", type=int, default=300)
    global_sync.add_argument("--sources", action="store_true")
    global_sync.set_defaults(func=sync_global)
    league_sync = commands.add_parser("sync-league")
    league_sync.add_argument("--season", type=int, default=datetime.now().year)
    league_sync.add_argument("--week", type=int)
    league_sync.add_argument("--league-id")
    league_sync.add_argument("--pending", action="store_true")
    league_sync.set_defaults(func=sync_league)
    return root


if __name__ == "__main__":
    args = parser().parse_args()
    args.func(args)
