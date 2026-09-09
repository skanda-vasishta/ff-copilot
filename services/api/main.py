import asyncio
import os
import statistics
import time
from collections import OrderedDict
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Any, Literal

import httpx
import jwt
from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
SUPABASE_AUDIENCE = os.getenv("SUPABASE_JWT_AUDIENCE", "authenticated")
PLAYER_DIRECTORY_CACHE_TTL = 300
PLAYER_DIRECTORY_CACHE_LIMIT = 256
player_directory_responses: OrderedDict[tuple[Any, ...], tuple[float, dict[str, Any]]] = OrderedDict()


def cached_player_directory(key: tuple[Any, ...]) -> dict[str, Any] | None:
    cached = player_directory_responses.get(key)
    if not cached:
        return None
    expires_at, payload = cached
    if expires_at <= time.monotonic():
        player_directory_responses.pop(key, None)
        return None
    player_directory_responses.move_to_end(key)
    return payload


def cache_player_directory(key: tuple[Any, ...], payload: dict[str, Any]) -> None:
    player_directory_responses[key] = (time.monotonic() + PLAYER_DIRECTORY_CACHE_TTL, payload)
    player_directory_responses.move_to_end(key)
    while len(player_directory_responses) > PLAYER_DIRECTORY_CACHE_LIMIT:
        player_directory_responses.popitem(last=False)


class AuthenticatedUser(BaseModel):
    id: str
    email: str | None = None
    token: str


class LeagueLink(BaseModel):
    provider: Literal["espn", "sleeper"] = "espn"
    external_id: str = Field(min_length=1, max_length=100)
    season: int = Field(ge=2000, le=2100)
    name: str | None = Field(default=None, max_length=200)


class TeamSelection(BaseModel):
    team_id: str


class SupabaseREST:
    def __init__(self, token: str):
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise HTTPException(status_code=503, detail="Supabase is not configured")
        self.base_url = f"{SUPABASE_URL}/rest/v1"
        self.headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    async def request(
        self,
        method: str,
        table: str,
        *,
        params: dict[str, Any] | None = None,
        json: Any = None,
        prefer: str | None = None,
    ) -> tuple[Any, httpx.Headers]:
        headers = dict(self.headers)
        if prefer:
            headers["Prefer"] = prefer
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.request(
                method, f"{self.base_url}/{table}", params=params, json=json, headers=headers
            )
        if response.status_code >= 400:
            detail = response.json().get("message", response.text) if response.content else response.reason_phrase
            raise HTTPException(status_code=response.status_code, detail=detail)
        if not response.content:
            return None, response.headers
        return response.json(), response.headers


@lru_cache
def jwk_client() -> jwt.PyJWKClient:
    if not SUPABASE_URL:
        raise RuntimeError("SUPABASE_URL is not configured")
    return jwt.PyJWKClient(f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json")


async def current_user(request: Request) -> AuthenticatedUser:
    authorization = request.headers.get("authorization", "")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        signing_key = jwk_client().get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256", "ES256"],
            audience=SUPABASE_AUDIENCE,
            issuer=f"{SUPABASE_URL}/auth/v1",
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from exc
    return AuthenticatedUser(id=claims["sub"], email=claims.get("email"), token=token)


def db_for(user: AuthenticatedUser = Depends(current_user)) -> SupabaseREST:
    return SupabaseREST(user.token)


app = FastAPI(title="FF Copilot API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv(
        "ALLOWED_ORIGINS", "http://localhost:3000,https://ff-copilot.vercel.app"
    ).split(",")],
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/")
async def root() -> dict[str, str]:
    return {"name": "FF Copilot API", "version": "1.0.0", "status": "ok"}


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/v1/players")
async def list_players(
    response: Response,
    search: str | None = None,
    position: str | None = None,
    nfl_team: str | None = None,
    season: int | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    sort: Literal["name", "projected_total_points", "average_rank", "median_rank"] = "name",
    direction: Literal["asc", "desc"] = "asc",
    db: SupabaseREST = Depends(db_for),
):
    response.headers["Cache-Control"] = "private, max-age=300, stale-while-revalidate=900"
    response.headers["Vary"] = "Authorization"
    cache_key = (search or "", position or "", nfl_team or "", season, page, page_size, sort, direction)
    cached = cached_player_directory(cache_key)
    if cached is not None:
        response.headers["X-FF-Cache"] = "HIT"
        return cached
    params: dict[str, Any] = {
        "select": "id,name,position,nfl_team,active,season,injury_status,projected_total_points,average_rank,median_rank,source_count,fetched_at",
        "limit": page_size,
        "offset": (page - 1) * page_size,
        "order": f"{sort}.{direction}.nullslast",
    }
    if search:
        params["name"] = f"ilike.*{search.replace('*', '')}*"
    if position:
        params["position"] = f"eq.{position}"
    if nfl_team:
        params["nfl_team"] = f"eq.{nfl_team}"
    if season:
        params["season"] = f"eq.{season}"
    data, headers = await db.request("GET", "player_directory_cache", params=params, prefer="count=exact")
    total = int(headers.get("content-range", "0/0").split("/")[-1].replace("*", "0"))
    payload = {"items": data, "page": page, "page_size": page_size, "total": total}
    cache_player_directory(cache_key, payload)
    response.headers["X-FF-Cache"] = "MISS"
    return payload


@app.get("/v1/draft/player-pool")
async def draft_player_pool(
    season: int = Query(2026, ge=2000, le=2100),
    db: SupabaseREST = Depends(db_for),
):
    async def all_rows(table: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        page_size = 1000
        for offset in range(0, 10_000, page_size):
            page, _ = await db.request("GET", table, params={
                **params, "limit": page_size, "offset": offset,
            })
            rows.extend(page)
            if len(page) < page_size:
                break
        return rows

    external_ids = await all_rows("player_external_ids", {
        "provider": "in.(espn,sleeper)", "select": "player_id,provider,external_id",
    })
    directory = await all_rows("player_directory_cache", {
        "season": f"eq.{season}", "select": "*",
    })
    espn_by_player = {row["player_id"]: row["external_id"] for row in external_ids if row.get("provider", "espn") == "espn"}
    sleeper_by_player = {row["player_id"]: row["external_id"] for row in external_ids if row.get("provider") == "sleeper"}
    return {"items": [
        {**player, "espn_id": espn_by_player.get(player["id"]), "sleeper_id": sleeper_by_player.get(player["id"])}
        for player in directory if espn_by_player.get(player["id"]) or sleeper_by_player.get(player["id"])
    ]}


async def require_player(player_id: str, db: SupabaseREST) -> dict[str, Any]:
    data, _ = await db.request("GET", "players", params={"id": f"eq.{player_id}", "select": "*"})
    if not data:
        raise HTTPException(status_code=404, detail="Player not found")
    return data[0]


def ranking_summary(data: list[dict[str, Any]]) -> dict[str, float | int | None]:
    comparable_types = {"current_draft_rank", "platform_adp", "expert_consensus_rank"}
    latest_by_source: dict[str, dict[str, Any]] = {}
    for row in sorted(data, key=lambda item: item.get("fetched_at") or "", reverse=True):
        if (
            row.get("overall_rank") is not None
            and str(row.get("scoring_format", "")).lower() == "ppr"
            and row.get("ranking_type") in comparable_types
        ):
            latest_by_source.setdefault(row["source"], row)
    ranks = sorted(float(row["overall_rank"]) for row in latest_by_source.values())
    median = None if not ranks else (ranks[len(ranks)//2] if len(ranks) % 2 else sum(ranks[len(ranks)//2-1:len(ranks)//2+1]) / 2)
    return {
        "average": sum(ranks) / len(ranks) if ranks else None,
        "median": median,
        "minimum": min(ranks) if ranks else None,
        "maximum": max(ranks) if ranks else None,
        "source_count": len(latest_by_source),
    }


def projection_summary(data: list[dict[str, Any]]) -> dict[str, Any]:
    """Combine the latest full-PPR cumulative projection from each source."""
    latest_by_source: dict[str, dict[str, Any]] = {}
    for row in sorted(data, key=lambda item: item.get("fetched_at") or "", reverse=True):
        raw = row.get("raw_payload") or {}
        scoring_format = str(raw.get("scoring_format") or "").lower()
        # ESPN rows before migration 0014 came from the same full-PPR reference
        # league but did not persist that marker.
        compatible = scoring_format == "ppr" or row.get("source") == "espn"
        if compatible and row.get("projected_total_points") is not None:
            latest_by_source.setdefault(str(row["source"]), row)
    sources = [
        {
            "source": source,
            "projected_total_points": float(row["projected_total_points"]),
            "source_updated_at": row.get("source_updated_at"),
            "fetched_at": row.get("fetched_at"),
        }
        for source, row in sorted(latest_by_source.items())
    ]
    total = sum(item["projected_total_points"] for item in sources) / len(sources) if sources else None
    return {
        "projected_total_points": total,
        "projected_average_points": total / 17 if total is not None else None,
        "source_count": len(sources),
        "scoring_format": "ppr",
        "scope": "full_season_cumulative",
        "games_denominator": 17,
        "sources": sources,
    }


def normalize_espn_nfl_schedule(payload: dict[str, Any], team_key: str, season: int) -> list[dict[str, Any]]:
    """Return a compact fantasy-friendly NFL schedule from ESPN's public team feed."""
    def number(value: Any) -> float | int | None:
        try:
            parsed = float(value)
            return int(parsed) if parsed.is_integer() else parsed
        except (TypeError, ValueError):
            return None

    games = []
    normalized_key = team_key.upper()
    for event in payload.get("events", []):
        if int((event.get("seasonType") or {}).get("type") or 0) != 2:
            continue
        competition = (event.get("competitions") or [{}])[0]
        competitors = competition.get("competitors") or []
        mine = next((item for item in competitors if normalized_key in {
            str(item.get("id", "")).upper(), str((item.get("team") or {}).get("id", "")).upper(),
            str((item.get("team") or {}).get("abbreviation", "")).upper(),
        }), None)
        if not mine:
            continue
        opponent = next((item for item in competitors if item is not mine), None)
        if not opponent:
            continue
        status = ((competition.get("status") or {}).get("type") or {})
        games.append({
            "week": int((event.get("week") or {}).get("number") or 0),
            "opponent": (opponent.get("team") or {}).get("abbreviation"),
            "opponent_name": (opponent.get("team") or {}).get("displayName"),
            "home_away": mine.get("homeAway"), "date": event.get("date"),
            "status": status.get("description") or status.get("name") or "Scheduled",
            "completed": bool(status.get("completed")), "team_score": number(mine.get("score")),
            "opponent_score": number(opponent.get("score")), "event_id": event.get("id"),
        })
    bye_week = number(payload.get("byeWeek"))
    if bye_week and not any(game["week"] == int(bye_week) for game in games):
        games.append({"week": int(bye_week), "opponent": None, "opponent_name": "BYE",
                      "home_away": None, "date": None, "status": "Bye", "completed": False,
                      "team_score": None, "opponent_score": None, "event_id": None})
    return sorted((game for game in games if game["week"]), key=lambda game: game["week"])


@app.get("/v1/rankings/consensus")
async def consensus_rankings(
    season: int = Query(2026, ge=2000, le=2100),
    position: Literal["QB", "RB", "WR", "TE"] | None = None,
    limit: int = Query(30, ge=1, le=100),
    db: SupabaseREST = Depends(db_for),
):
    source_types = {
        "espn": "current_draft_rank",
        "sleeper": "platform_adp",
        "fantasypros": "expert_consensus_rank",
        "fftoday": "projected_position_rank",
    }
    responses = await asyncio.gather(*[
        db.request("GET", "player_rankings", params={
            "season": f"eq.{season}", "source": f"eq.{source}",
            "scoring_format": "eq.ppr", "ranking_type": f"eq.{ranking_type}",
            "select": "player_id,source,ranking_type,overall_rank,position_rank,fetched_at,player:players(id,name,position,nfl_team,active)",
            "order": "fetched_at.desc", "limit": 1000,
        }) for source, ranking_type in source_types.items()
    ])
    rows = [row for response, _ in responses for row in response]
    latest_by_player_source: dict[tuple[str, str], dict[str, Any]] = {}
    for row in rows:
        player = row.get("player") or {}
        if position and player.get("position") != position:
            continue
        latest_by_player_source.setdefault((row["player_id"], row["source"]), row)

    grouped: dict[str, list[dict[str, Any]]] = {}
    for (player_id, _), row in latest_by_player_source.items():
        grouped.setdefault(player_id, []).append(row)
    items = []
    for player_id, rankings in grouped.items():
        player = rankings[0].get("player") or {}
        position_ranks = [float(row["position_rank"]) for row in rankings if row.get("position_rank") is not None]
        overall_ranks = [float(row["overall_rank"]) for row in rankings if row.get("overall_rank") is not None]
        if not position_ranks:
            continue
        items.append({
            "player": player,
            "position_consensus_average": sum(position_ranks) / len(position_ranks),
            "position_consensus_median": statistics.median(position_ranks),
            "overall_consensus_average": sum(overall_ranks) / len(overall_ranks) if overall_ranks else None,
            "overall_consensus_median": statistics.median(overall_ranks) if overall_ranks else None,
            "position_source_count": len(position_ranks),
            "overall_source_count": len(overall_ranks),
            "sources": [{
                "source": row["source"], "ranking_type": row["ranking_type"],
                "overall_rank": row.get("overall_rank"), "position_rank": row.get("position_rank"),
                "fetched_at": row.get("fetched_at"),
            } for row in sorted(rankings, key=lambda item: item["source"])],
        })
    items.sort(key=lambda item: (item["position_consensus_average"], item["player"].get("name") or ""))
    return {
        "season": season, "position": position, "scoring_format": "ppr",
        "method": "Simple average of each source's latest comparable positional rank. ESPN is platform draft rank, Sleeper is platform PPR ADP, FantasyPros is expert consensus rank, and FFToday is projection-derived.",
        "items": items[:limit],
    }


@app.get("/v1/players/{player_id}")
async def get_player(player_id: str, db: SupabaseREST = Depends(db_for)):
    return await require_player(player_id, db)


@app.get("/v1/players/{player_id}/detail")
async def get_player_detail(player_id: str, season: int | None = None, db: SupabaseREST = Depends(db_for)):
    player = await require_player(player_id, db)
    snapshot_params = {"player_id": f"eq.{player_id}", "select": "*", "order": "fetched_at.desc"}
    ranking_params = {"player_id": f"eq.{player_id}", "select": "*", "order": "fetched_at.desc"}
    if season:
        snapshot_params["season"] = f"eq.{season}"
        ranking_params["season"] = f"eq.{season}"
    (snapshots, _), (rankings, _), (sources, _) = await asyncio.gather(
        db.request("GET", "player_snapshots", params=snapshot_params),
        db.request("GET", "player_rankings", params=ranking_params),
        db.request("GET", "source_documents", params={
            "player_id": f"eq.{player_id}", "select": "*", "order": "fetched_at.desc"
        }),
    )
    return {
        "player": player,
        "snapshots": snapshots,
        "projections": projection_summary(snapshots),
        "rankings": {"items": rankings, "summary": ranking_summary(rankings)},
        "sources": sources,
    }


@app.get("/v1/players/{player_id}/schedule")
async def get_player_schedule(
    player_id: str,
    season: int = Query(2026, ge=2000, le=2100),
    db: SupabaseREST = Depends(db_for),
):
    player = await require_player(player_id, db)
    team = str(player.get("nfl_team") or "").strip()
    if not team or team.upper() in {"FA", "FREE AGENT"}:
        return {"player": player, "season": season, "team": team or None, "games": [],
                "source": "ESPN", "note": "This player is not assigned to an NFL team."}
    url = f"https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/{team.lower()}/schedule"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(url, params={"season": season})
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Could not load the NFL schedule from ESPN") from exc
    return {"player": player, "season": season, "team": team,
            "games": normalize_espn_nfl_schedule(payload, team, season),
            "source": "ESPN", "fetched_at": datetime.now().astimezone().isoformat()}


@app.get("/v1/players/{player_id}/snapshots")
async def get_player_snapshots(player_id: str, season: int | None = None, db: SupabaseREST = Depends(db_for)):
    await require_player(player_id, db)
    params = {"player_id": f"eq.{player_id}", "select": "*", "order": "fetched_at.desc"}
    if season:
        params["season"] = f"eq.{season}"
    data, _ = await db.request("GET", "player_snapshots", params=params)
    return data


@app.get("/v1/players/{player_id}/rankings")
async def get_player_rankings(player_id: str, season: int | None = None, db: SupabaseREST = Depends(db_for)):
    await require_player(player_id, db)
    params = {"player_id": f"eq.{player_id}", "select": "*", "order": "fetched_at.desc"}
    if season:
        params["season"] = f"eq.{season}"
    data, _ = await db.request("GET", "player_rankings", params=params)
    return {"items": data, "summary": ranking_summary(data)}


@app.get("/v1/players/{player_id}/sources")
async def get_player_sources(player_id: str, db: SupabaseREST = Depends(db_for)):
    await require_player(player_id, db)
    data, _ = await db.request("GET", "source_documents", params={
        "player_id": f"eq.{player_id}", "select": "*", "order": "fetched_at.desc"
    })
    return data


@app.get("/v1/me/leagues")
async def my_leagues(user: AuthenticatedUser = Depends(current_user), db: SupabaseREST = Depends(db_for)):
    data, _ = await db.request("GET", "user_leagues", params={
        "user_id": f"eq.{user.id}", "select": "created_at,league:leagues(*)", "order": "created_at.desc"
    })
    available = [{**row, "state": "available"} for row in data]
    deduplicated: dict[tuple[str, str], dict[str, Any]] = {}
    for row in available:
        league = row["league"]
        key = (league["provider"], league["external_id"])
        current = deduplicated.get(key)
        candidate_priority = (league["season"], row["state"] == "available", row["created_at"])
        if current is None:
            deduplicated[key] = row
            continue
        current_priority = (
            current["league"]["season"], current["state"] == "available", current["created_at"]
        )
        if candidate_priority > current_priority:
            deduplicated[key] = row
    return sorted(deduplicated.values(), key=lambda row: row["created_at"], reverse=True)


@app.delete("/v1/me/leagues/{league_id}", status_code=204)
async def unlink_league(league_id: str, user: AuthenticatedUser = Depends(current_user), db: SupabaseREST = Depends(db_for)):
    await db.request("DELETE", "user_leagues", params={"user_id": f"eq.{user.id}", "league_id": f"eq.{league_id}"})


@app.get("/v1/me/teams")
async def my_teams(user: AuthenticatedUser = Depends(current_user), db: SupabaseREST = Depends(db_for)):
    data, _ = await db.request("GET", "user_team_selections", params={
        "user_id": f"eq.{user.id}", "select": "created_at,team:fantasy_teams(*,league:leagues(*))"
    })
    return data


@app.post("/v1/me/teams", status_code=201)
async def select_team(selection: TeamSelection, user: AuthenticatedUser = Depends(current_user), db: SupabaseREST = Depends(db_for)):
    data, _ = await db.request("POST", "user_team_selections", json={"user_id": user.id, "team_id": selection.team_id},
                               prefer="resolution=ignore-duplicates,return=representation")
    return data[0] if data else {"user_id": user.id, "team_id": selection.team_id}


@app.delete("/v1/me/teams/{team_id}", status_code=204)
async def unselect_team(team_id: str, user: AuthenticatedUser = Depends(current_user), db: SupabaseREST = Depends(db_for)):
    await db.request("DELETE", "user_team_selections", params={"user_id": f"eq.{user.id}", "team_id": f"eq.{team_id}"})


@app.get("/v1/leagues/{league_id}/teams")
async def league_teams(league_id: str, db: SupabaseREST = Depends(db_for)):
    data, _ = await db.request("GET", "fantasy_teams", params={"league_id": f"eq.{league_id}", "select": "*", "order": "name.asc"})
    return data


@app.get("/v1/leagues/{league_id}/transactions")
async def league_transactions(
    league_id: str,
    team_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    transaction_type: Literal["all", "trade", "waiver", "free_agent"] = "all",
    time_range: Literal["all", "7d", "30d"] = "all",
    filter_team_id: str | None = None,
    db: SupabaseREST = Depends(db_for),
):
    teams, _ = await db.request("GET", "fantasy_teams", params={
        "league_id": f"eq.{league_id}", "id": f"eq.{team_id}", "select": "id", "limit": 1,
    })
    if not teams:
        raise HTTPException(status_code=404, detail="Team not found in league")

    select = "*,initiated_by_team:fantasy_teams!league_transactions_initiated_by_team_id_fkey(id,name),items:league_transaction_items(*,player:players(id,name,position,nfl_team),from_team:fantasy_teams!league_transaction_items_from_team_id_fkey(id,name),to_team:fantasy_teams!league_transaction_items_to_team_id_fkey(id,name))"
    pending, _ = await db.request("GET", "league_transactions", params={
        "league_id": f"eq.{league_id}", "status": "eq.PENDING", "select": select,
        "order": "proposed_at.desc.nullslast,fetched_at.desc", "limit": 100,
    })
    completed_types = {
        "all": "FREEAGENT,FREE_AGENT,WAIVER,TRADE,TRADE_ACCEPT,TRADE_ACCEPTED,TRADE_UPHOLD",
        "trade": "TRADE,TRADE_ACCEPT,TRADE_ACCEPTED,TRADE_UPHOLD",
        "waiver": "WAIVER",
        "free_agent": "FREEAGENT,FREE_AGENT",
    }
    completed_params: dict[str, Any] = {
        "league_id": f"eq.{league_id}", "status": "in.(EXECUTED,PROCESSED,ACCEPTED,COMPLETED)",
        "select": select, "order": "processed_at.desc.nullslast,proposed_at.desc.nullslast",
        "transaction_type": f"in.({completed_types[transaction_type]})",
        "limit": page_size, "offset": (page - 1) * page_size,
    }
    if time_range != "all":
        days = 7 if time_range == "7d" else 30
        completed_params["processed_at"] = f"gte.{(datetime.now(timezone.utc) - timedelta(days=days)).isoformat()}"
    no_matching_transactions = False
    if filter_team_id:
        filter_teams, _ = await db.request("GET", "fantasy_teams", params={
            "league_id": f"eq.{league_id}", "id": f"eq.{filter_team_id}", "select": "id", "limit": 1,
        })
        if not filter_teams:
            raise HTTPException(status_code=404, detail="Filter team not found in league")
        matching_items, _ = await db.request("GET", "league_transaction_items", params={
            "or": f"(from_team_id.eq.{filter_team_id},to_team_id.eq.{filter_team_id})",
            "select": "transaction_id",
        })
        transaction_ids = sorted({item["transaction_id"] for item in matching_items})
        if not transaction_ids:
            no_matching_transactions = True
        else:
            completed_params["id"] = f"in.({','.join(transaction_ids)})"
    if no_matching_transactions:
        completed, completed_headers = [], {"content-range": "*/0"}
    else:
        completed, completed_headers = await db.request(
            "GET", "league_transactions", params=completed_params, prefer="count=exact"
        )

    def involves_selected_team(transaction: dict[str, Any]) -> bool:
        return any(
            item.get("from_team_id") == team_id or item.get("to_team_id") == team_id
            for item in transaction.get("items") or []
        )

    pending_trades = [
        transaction for transaction in pending
        if transaction.get("transaction_type") in {"TRADE", "TRADE_PROPOSAL"}
        and involves_selected_team(transaction)
    ]
    incoming = [
        transaction for transaction in pending_trades
        if transaction.get("initiated_by_team_id") is not None
        and transaction.get("initiated_by_team_id") != team_id
    ]
    outgoing = [
        transaction for transaction in pending_trades
        if transaction.get("initiated_by_team_id") == team_id
    ]
    total = int(completed_headers.get("content-range", "0/0").split("/")[-1].replace("*", "0"))
    return {"incoming": incoming, "outgoing": outgoing, "league": {
        "items": completed, "page": page, "page_size": page_size, "total": total,
        "total_pages": (total + page_size - 1) // page_size,
    }}
@app.get("/v1/teams/{team_id}/matchup")
async def team_matchup(
    team_id: str,
    week: int | None = Query(None, ge=1, le=25),
    db: SupabaseREST = Depends(db_for),
):
    teams, _ = await db.request("GET", "fantasy_teams", params={
        "id": f"eq.{team_id}", "select": "*,league:leagues(id,name,season,current_week,last_synced_at)", "limit": 1,
    })
    if not teams:
        raise HTTPException(status_code=404, detail="Team not found or unavailable")
    team = teams[0]
    league = team["league"]
    matchups, _ = await db.request("GET", "league_matchups", params={
        "league_id": f"eq.{league['id']}", "season": f"eq.{league['season']}",
        "select": "*,home_team:fantasy_teams!league_matchups_home_team_id_fkey(*),away_team:fantasy_teams!league_matchups_away_team_id_fkey(*)",
        "order": "week.asc", "limit": 500,
    })
    available_weeks = sorted({int(item["week"]) for item in matchups})
    selected_week = week or league.get("current_week") or (available_weeks[0] if available_weeks else 1)
    matchup = next((item for item in matchups if int(item["week"]) == selected_week and
                    team_id in (item.get("home_team_id"), item.get("away_team_id"))), None)
    if not matchup:
        return {"matchup": None, "week": selected_week, "available_weeks": available_weeks,
                "league": league, "lineups": {}}

    matchup_team_ids = [matchup["home_team_id"], matchup["away_team_id"]]
    snapshots, _ = await db.request("GET", "roster_snapshots", params={
        "team_id": f"in.({','.join(matchup_team_ids)})", "season": f"eq.{league['season']}",
        "select": "id,team_id,week,fetched_at", "order": "fetched_at.desc", "limit": 1000,
    })
    latest_by_team: dict[str, dict[str, Any]] = {}
    for snapshot in snapshots:
        latest_by_team.setdefault(snapshot["team_id"], snapshot)
    snapshot_ids = [snapshot["id"] for snapshot in latest_by_team.values()]
    roster_rows = []
    if snapshot_ids:
        roster_rows, _ = await db.request("GET", "roster_players", params={
            "roster_snapshot_id": f"in.({','.join(snapshot_ids)})",
            "select": "roster_snapshot_id,lineup_slot,player:players(id,name,position,nfl_team)", "limit": 500,
        })
    player_ids = [row["player"]["id"] for row in roster_rows if row.get("player")]
    metrics_by_player: dict[str, dict[str, Any]] = {}
    if player_ids:
        metrics, _ = await db.request("GET", "player_directory_cache", params={
            "id": f"in.({','.join(player_ids)})", "season": f"eq.{league['season']}",
            "select": "id,projected_average_points,average_points,injury_status", "limit": 500,
        })
        metrics_by_player = {item["id"]: item for item in metrics}
    team_by_snapshot = {snapshot["id"]: team_id for team_id, snapshot in latest_by_team.items()}
    lineups: dict[str, list[dict[str, Any]]] = {value: [] for value in matchup_team_ids}
    for row in roster_rows:
        player = row.get("player")
        owner_id = team_by_snapshot.get(row["roster_snapshot_id"])
        if player and owner_id:
            lineups[owner_id].append({**player, **metrics_by_player.get(player["id"], {}),
                                      "lineup_slot": row.get("lineup_slot")})
    return {"matchup": matchup, "week": selected_week, "available_weeks": available_weeks,
            "league": league, "lineups": lineups}


@app.get("/v1/leagues/{league_id}/seasons")
async def league_seasons(league_id: str, db: SupabaseREST = Depends(db_for)):
    data, _ = await db.request("POST", "rpc/link_league_history", json={"p_league_id": league_id})
    if not data:
        raise HTTPException(status_code=404, detail="League not found")
    return sorted(data, key=lambda league: league["season"], reverse=True)


@app.get("/v1/leagues/{league_id}/draft-picks")
async def league_draft_picks(
    league_id: str,
    season: int | None = Query(None, ge=2000, le=2100),
    round_number: int | None = Query(None, ge=1, le=40),
    team_name: str | None = Query(None, min_length=1, max_length=100),
    position: Literal["QB", "RB", "WR", "TE"] | None = None,
    overall_pick: int | None = Query(None, ge=1, le=1000),
    window: int = Query(3, ge=0, le=20),
    limit: int = Query(200, ge=1, le=500),
    db: SupabaseREST = Depends(db_for),
):
    if overall_pick is not None and season is None:
        raise HTTPException(status_code=400, detail="season is required when querying around an overall pick")
    leagues, _ = await db.request("POST", "rpc/link_league_history", json={"p_league_id": league_id})
    if not leagues:
        raise HTTPException(status_code=404, detail="League not found")
    available_seasons = sorted({int(league["season"]) for league in leagues}, reverse=True)
    selected_leagues = [league for league in leagues if season is None or int(league["season"]) == season]
    if season is not None and not selected_leagues:
        return {"items": [], "available_seasons": available_seasons, "filters": {"season": season}}

    params: dict[str, Any] = {
        "league_id": f"in.({','.join(league['id'] for league in selected_leagues)})",
        "select": "*,league:leagues(season,name,external_id)",
        "order": "overall_pick.asc",
        "limit": min(2000, max(limit, (window * 2 + 1) * len(selected_leagues))),
    }
    if round_number is not None:
        params["round_number"] = f"eq.{round_number}"
    if team_name:
        params["team_name"] = f"ilike.*{team_name.replace('*', '')}*"
    if position:
        params["player_position"] = f"eq.{position}"
    if overall_pick is not None:
        params["overall_pick"] = f"gte.{max(1, overall_pick - window)}"
        params["and"] = f"(overall_pick.lte.{overall_pick + window})"
    picks, _ = await db.request("GET", "league_draft_picks", params=params)
    picks = sorted(
        picks,
        key=lambda pick: (-int(pick.get("league", {}).get("season", 0)), int(pick["overall_pick"])),
    )[:limit]
    return {
        "items": picks,
        "available_seasons": available_seasons,
        "filters": {
            "season": season, "round_number": round_number, "team_name": team_name,
            "position": position, "overall_pick": overall_pick, "window": window,
        },
    }


@app.get("/v1/leagues/{league_id}/free-agents")
async def league_free_agents(
    league_id: str,
    season: int = Query(2026, ge=2000, le=2100),
    position: Literal["QB", "RB", "WR", "TE"] | None = None,
    limit: int = Query(25, ge=1, le=100),
    sort: Literal["median_rank", "average_rank", "projected_total_points", "name"] = "projected_total_points",
    db: SupabaseREST = Depends(db_for),
):
    teams, _ = await db.request("GET", "fantasy_teams", params={
        "league_id": f"eq.{league_id}", "select": "id", "order": "id.asc"
    })
    if not teams:
        raise HTTPException(status_code=404, detail="League not found or unavailable")

    team_ids = [team["id"] for team in teams]
    snapshots, _ = await db.request("GET", "roster_snapshots", params={
        "team_id": f"in.({','.join(team_ids)})", "season": f"eq.{season}",
        "select": "id,team_id,fetched_at", "order": "fetched_at.desc", "limit": 1000,
    })
    latest_by_team: dict[str, dict[str, Any]] = {}
    for snapshot in snapshots:
        latest_by_team.setdefault(snapshot["team_id"], snapshot)

    rostered_ids: set[str] = set()
    latest_snapshots = list(latest_by_team.values())
    if latest_snapshots:
        snapshot_ids = [snapshot["id"] for snapshot in latest_snapshots]
        roster_rows, _ = await db.request("GET", "roster_players", params={
            "roster_snapshot_id": f"in.({','.join(snapshot_ids)})", "select": "player_id", "limit": 2000,
        })
        rostered_ids = {row["player_id"] for row in roster_rows}

    directory_params: dict[str, Any] = {
        "season": f"eq.{season}", "select": "*", "limit": 1000,
        "order": f"{sort}.{'desc' if sort == 'projected_total_points' else 'asc'}.nullslast",
    }
    if position:
        directory_params["position"] = f"eq.{position}"
    players, _ = await db.request("GET", "player_directory_cache", params=directory_params)
    available = [player for player in players if player["id"] not in rostered_ids][:limit]
    refreshed_at = max((snapshot["fetched_at"] for snapshot in latest_snapshots), default=None)
    return {
        "items": available,
        "season": season,
        "league_id": league_id,
        "rostered_player_count": len(rostered_ids),
        "roster_snapshots_found": len(latest_snapshots),
        "league_team_count": len(teams),
        "availability_as_of": refreshed_at,
    }


@app.get("/v1/teams/{team_id}/roster")
async def team_roster(team_id: str, db: SupabaseREST = Depends(db_for)):
    snapshots, _ = await db.request("GET", "roster_snapshots", params={
        "team_id": f"eq.{team_id}", "select": "*", "order": "fetched_at.desc", "limit": 1
    })
    if not snapshots:
        return {"snapshot": None, "players": []}
    roster, _ = await db.request("GET", "roster_players", params={
        "roster_snapshot_id": f"eq.{snapshots[0]['id']}", "select": "lineup_slot,acquisition_type,player:players(*)"
    })
    return {"snapshot": snapshots[0], "players": roster}


def source_freshness(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    summary: dict[str, dict[str, Any]] = {}
    for row in rows:
        source = row["source"]
        current = summary.setdefault(source, {"latest_fetched_at": None, "player_count": 0, "_players": set()})
        current["latest_fetched_at"] = max(current["latest_fetched_at"] or row["fetched_at"], row["fetched_at"])
        if row.get("player_id"):
            current["_players"].add(row["player_id"])
    for current in summary.values():
        current["player_count"] = len(current.pop("_players"))
    return summary


@app.get("/v1/sync-status")
async def sync_status(
    season: int = Query(2026, ge=2000, le=2100),
    user: AuthenticatedUser = Depends(current_user),
    db: SupabaseREST = Depends(db_for),
):
    requests, _ = await db.request("GET", "sync_requests", params={
        "requested_by": f"eq.{user.id}", "select": "*", "order": "requested_at.desc", "limit": 20
    })
    runs, _ = await db.request("GET", "sync_runs", params={
        "season": f"eq.{season}", "select": "*", "order": "started_at.desc", "limit": 20
    })
    snapshots, _ = await db.request("GET", "player_snapshots", params={
        "season": f"eq.{season}", "select": "player_id,source,fetched_at", "limit": 10000
    })
    rankings, _ = await db.request("GET", "player_rankings", params={
        "season": f"eq.{season}", "select": "player_id,source,fetched_at", "limit": 10000
    })
    documents, _ = await db.request("GET", "source_documents", params={
        "select": "player_id,source,fetched_at", "limit": 10000
    })
    return {
        "season": season,
        "requests": requests,
        "runs": runs,
        "latest_global_run": next((run for run in runs if run["kind"] == "global"), None),
        "freshness": {
            "snapshots": source_freshness(snapshots),
            "rankings": source_freshness(rankings),
            "documents": source_freshness(documents),
        },
    }
