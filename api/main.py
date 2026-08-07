import os
from functools import lru_cache
from typing import Any, Literal

import httpx
import jwt
from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
SUPABASE_AUDIENCE = os.getenv("SUPABASE_JWT_AUDIENCE", "authenticated")


class AuthenticatedUser(BaseModel):
    id: str
    email: str | None = None
    token: str


class LeagueLink(BaseModel):
    provider: Literal["espn"] = "espn"
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
    params: dict[str, Any] = {
        "select": "*",
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
    data, headers = await db.request("GET", "player_directory", params=params, prefer="count=exact")
    total = int(headers.get("content-range", "0/0").split("/")[-1].replace("*", "0"))
    return {"items": data, "page": page, "page_size": page_size, "total": total}


async def require_player(player_id: str, db: SupabaseREST) -> dict[str, Any]:
    data, _ = await db.request("GET", "players", params={"id": f"eq.{player_id}", "select": "*"})
    if not data:
        raise HTTPException(status_code=404, detail="Player not found")
    return data[0]


@app.get("/v1/players/{player_id}")
async def get_player(player_id: str, db: SupabaseREST = Depends(db_for)):
    return await require_player(player_id, db)


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
    ranks = [float(row["overall_rank"]) for row in data if row.get("overall_rank") is not None]
    ranks.sort()
    median = None if not ranks else (ranks[len(ranks)//2] if len(ranks) % 2 else sum(ranks[len(ranks)//2-1:len(ranks)//2+1]) / 2)
    return {"items": data, "summary": {
        "average": sum(ranks) / len(ranks) if ranks else None,
        "median": median, "minimum": min(ranks) if ranks else None,
        "maximum": max(ranks) if ranks else None,
        "source_count": len({row["source"] for row in data if row.get("overall_rank") is not None}),
    }}


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
    preparations, _ = await db.request("GET", "sync_requests", params={
        "requested_by": f"eq.{user.id}", "kind": "eq.league",
        "status": "in.(pending,running)", "select": "id,provider,external_id,season,requested_at,status",
        "order": "requested_at.desc",
    })
    available = [{**row, "state": "available"} for row in data]
    being_prepared = [
        {
            "created_at": request["requested_at"],
            "state": "being_prepared",
            "league": {
                "id": f"preparation:{request['id']}",
                "provider": request["provider"],
                "external_id": request["external_id"],
                "season": request["season"],
                "name": None,
                "status": "being_prepared",
                "last_synced_at": None,
            },
        }
        for request in preparations
    ]
    deduplicated: dict[tuple[str, str], dict[str, Any]] = {}
    for row in available + being_prepared:
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


@app.post("/v1/me/leagues", status_code=201)
async def link_league(link: LeagueLink, user: AuthenticatedUser = Depends(current_user), db: SupabaseREST = Depends(db_for)):
    leagues, _ = await db.request("POST", "rpc/link_existing_league", json={
        "p_provider": link.provider, "p_external_id": link.external_id, "p_season": link.season
    })
    if leagues:
        league = leagues[0]
        return {"state": "available", "league": league}
    existing, _ = await db.request("GET", "sync_requests", params={
        "requested_by": f"eq.{user.id}", "kind": "eq.league", "provider": f"eq.{link.provider}",
        "external_id": f"eq.{link.external_id}", "season": f"eq.{link.season}",
        "status": "in.(pending,running)", "select": "id", "limit": 1,
    })
    if existing:
        return {"state": "being_prepared"}
    request_row, _ = await db.request("POST", "sync_requests", json={
        "requested_by": user.id, "kind": "league", "provider": link.provider,
        "external_id": link.external_id, "season": link.season, "status": "pending"
    }, prefer="return=representation")
    return {"state": "being_prepared", "preparation_id": request_row[0]["id"]}


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


@app.get("/v1/leagues/{league_id}/seasons")
async def league_seasons(league_id: str, db: SupabaseREST = Depends(db_for)):
    data, _ = await db.request("POST", "rpc/link_league_history", json={"p_league_id": league_id})
    if not data:
        raise HTTPException(status_code=404, detail="League not found")
    return sorted(data, key=lambda league: league["season"], reverse=True)


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
