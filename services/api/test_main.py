from fastapi.testclient import TestClient

from services.api.main import AuthenticatedUser, app, current_user, db_for, source_freshness


client = TestClient(app)


def test_health_is_public():
    assert client.get("/health").json() == {"status": "ok"}


def test_v1_requires_authentication():
    response = client.get("/v1/players")
    assert response.status_code == 401
    assert response.json()["detail"] == "Missing bearer token"


def test_invalid_token_is_rejected():
    response = client.get("/v1/players", headers={"Authorization": "Bearer invalid"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid or expired token"


class FakeDB:
    async def request(self, method, table, **kwargs):
        assert method == "GET"
        assert table == "player_directory"
        assert kwargs["params"]["limit"] == 25
        return ([{"id": "player-1", "name": "Test Player"}], {"content-range": "0-0/1"})


def test_players_are_paginated_from_directory_view():
    app.dependency_overrides[db_for] = lambda: FakeDB()
    try:
        response = client.get("/v1/players")
        assert response.status_code == 200
        assert response.json() == {
            "items": [{"id": "player-1", "name": "Test Player"}],
            "page": 1,
            "page_size": 25,
            "total": 1,
        }
    finally:
        app.dependency_overrides.clear()


class DraftPoolDB:
    async def request(self, method, table, **kwargs):
        assert method == "GET"
        if table == "player_external_ids":
            return ([{"player_id": "player-1", "external_id": "123"}], {})
        if table == "player_directory":
            assert kwargs["params"]["season"] == "eq.2026"
            return ([{"id": "player-1", "name": "Draft Player"}], {})
        raise AssertionError(table)


def test_draft_pool_includes_espn_ids():
    app.dependency_overrides[db_for] = lambda: DraftPoolDB()
    try:
        response = client.get("/v1/draft/player-pool?season=2026")
        assert response.status_code == 200
        assert response.json() == {"items": [{"id": "player-1", "name": "Draft Player", "espn_id": "123"}]}
    finally:
        app.dependency_overrides.clear()


class FreeAgentDB:
    async def request(self, method, table, **kwargs):
        assert method == "GET"
        rows = {
            "fantasy_teams": [{"id": "team-1"}, {"id": "team-2"}],
            "roster_snapshots": [
                {"id": "new-1", "team_id": "team-1", "fetched_at": "2026-08-23T12:00:00Z"},
                {"id": "old-1", "team_id": "team-1", "fetched_at": "2026-08-20T12:00:00Z"},
                {"id": "new-2", "team_id": "team-2", "fetched_at": "2026-08-23T13:00:00Z"},
            ],
            "roster_players": [{"player_id": "rostered"}],
            "player_directory": [
                {"id": "rostered", "name": "Rostered Player", "median_rank": 1},
                {"id": "available", "name": "Available Player", "median_rank": 2},
            ],
        }
        if table == "roster_players":
            assert kwargs["params"]["roster_snapshot_id"] == "in.(new-1,new-2)"
        return rows[table], {}


def test_league_free_agents_exclude_players_on_latest_rosters():
    app.dependency_overrides[db_for] = lambda: FreeAgentDB()
    try:
        response = client.get("/v1/leagues/league-1/free-agents?season=2026")
        assert response.status_code == 200
        body = response.json()
        assert [player["id"] for player in body["items"]] == ["available"]
        assert body["rostered_player_count"] == 1
        assert body["roster_snapshots_found"] == 2
        assert body["league_team_count"] == 2
        assert body["availability_as_of"] == "2026-08-23T13:00:00Z"
    finally:
        app.dependency_overrides.clear()


class PlayerDetailDB:
    async def request(self, method, table, **kwargs):
        rows = {
            "players": [{"id": "player-1", "name": "Test Player"}],
            "player_snapshots": [{"id": "snapshot-1", "season": 2026}],
            "player_rankings": [
                {"id": "rank-1", "source": "espn", "overall_rank": 10},
                {"id": "rank-2", "source": "fantasypros", "overall_rank": 20},
            ],
            "source_documents": [{"id": "source-1", "source": "reddit"}],
        }
        return rows[table], {}


def test_player_detail_combines_facts_in_one_request():
    app.dependency_overrides[db_for] = lambda: PlayerDetailDB()
    try:
        response = client.get("/v1/players/player-1/detail?season=2026")
        assert response.status_code == 200
        body = response.json()
        assert body["player"]["name"] == "Test Player"
        assert body["snapshots"][0]["season"] == 2026
        assert body["rankings"]["summary"] == {
            "average": 15.0, "median": 15.0, "minimum": 10.0,
            "maximum": 20.0, "source_count": 2,
        }
        assert body["sources"][0]["source"] == "reddit"
    finally:
        app.dependency_overrides.clear()


def test_source_freshness_counts_unique_players_and_latest_fetch():
    summary = source_freshness([
        {"source": "espn", "player_id": "one", "fetched_at": "2026-08-01T00:00:00Z"},
        {"source": "espn", "player_id": "one", "fetched_at": "2026-08-02T00:00:00Z"},
        {"source": "espn", "player_id": "two", "fetched_at": "2026-08-01T00:00:00Z"},
    ])
    assert summary == {"espn": {"latest_fetched_at": "2026-08-02T00:00:00Z", "player_count": 2}}


class LeagueStateDB:
    async def request(self, method, table, **kwargs):
        if table == "user_leagues":
            return ([
                {
                    "created_at": "2025-08-01T00:00:00Z",
                    "league": {"id": "league-old", "provider": "espn", "external_id": "111", "season": 2025},
                },
                {
                    "created_at": "2026-08-01T00:00:00Z",
                    "league": {"id": "league-1", "provider": "espn", "external_id": "111", "season": 2026},
                },
            ], {})
        if table == "sync_requests":
            return ([
                {"id": "duplicate", "provider": "espn", "external_id": "111", "season": 2026, "requested_at": "2026-08-02T00:00:00Z", "status": "pending"},
                {"id": "new", "provider": "espn", "external_id": "222", "season": 2026, "requested_at": "2026-08-03T00:00:00Z", "status": "running"},
            ], {})
        raise AssertionError(table)


def test_my_leagues_presents_product_states_and_hides_duplicate_preparations():
    app.dependency_overrides[current_user] = lambda: AuthenticatedUser(id="user-1", token="token")
    app.dependency_overrides[db_for] = lambda: LeagueStateDB()
    try:
        response = client.get("/v1/me/leagues")
        assert response.status_code == 200
        by_external_id = {item["league"]["external_id"]: item for item in response.json()}
        assert set(by_external_id) == {"111", "222"}
        assert by_external_id["111"]["state"] == "available"
        assert by_external_id["111"]["league"]["id"] == "league-1"
        assert by_external_id["222"]["state"] == "being_prepared"
        assert "sync_request" not in by_external_id["222"]
    finally:
        app.dependency_overrides.clear()
