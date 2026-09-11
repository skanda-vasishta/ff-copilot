from fastapi.testclient import TestClient

from services.api.main import (
    AuthenticatedUser,
    app,
    current_user,
    db_for,
    player_directory_responses,
    projection_summary,
    normalize_espn_nfl_schedule,
    ranking_summary,
    source_freshness,
)


client = TestClient(app)


def test_health_is_public():
    assert client.get("/health").json() == {"status": "ok"}


def test_espn_nfl_schedule_includes_opponents_and_bye_week():
    payload = {"byeWeek": 6, "events": [{
        "id": "game-1", "date": "2026-09-13T20:25Z", "seasonType": {"type": 2},
        "week": {"number": 1}, "competitions": [{
            "status": {"type": {"description": "Scheduled", "completed": False}},
            "competitors": [
                {"id": "25", "homeAway": "home", "team": {"id": "25", "abbreviation": "SF", "displayName": "San Francisco 49ers"}},
                {"id": "26", "homeAway": "away", "team": {"id": "26", "abbreviation": "SEA", "displayName": "Seattle Seahawks"}},
            ],
        }],
    }]}
    games = normalize_espn_nfl_schedule(payload, "SF", 2026)
    assert games[0]["opponent"] == "SEA"
    assert games[0]["home_away"] == "home"
    assert games[1]["week"] == 6
    assert games[1]["status"] == "Bye"


def test_v1_requires_authentication():
    response = client.get("/v1/players")
    assert response.status_code == 401
    assert response.json()["detail"] == "Missing bearer token"


def test_invalid_token_is_rejected():
    response = client.get("/v1/players", headers={"Authorization": "Bearer invalid"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid or expired token"


class FakeDB:
    calls = 0

    async def request(self, method, table, **kwargs):
        self.calls += 1
        assert method == "GET"
        assert table == "player_directory_cache"
        assert kwargs["params"]["limit"] == 25
        return ([{"id": "player-1", "name": "Test Player"}], {"content-range": "0-0/1"})


def test_players_are_paginated_from_directory_view():
    fake_db = FakeDB()
    player_directory_responses.clear()
    app.dependency_overrides[db_for] = lambda: fake_db
    try:
        first = client.get("/v1/players")
        second = client.get("/v1/players")
        assert first.status_code == 200
        assert first.json() == {
            "items": [{"id": "player-1", "name": "Test Player"}],
            "page": 1,
            "page_size": 25,
            "total": 1,
        }
        assert first.headers["x-ff-cache"] == "MISS"
        assert second.headers["x-ff-cache"] == "HIT"
        assert second.headers["cache-control"] == "private, max-age=300, stale-while-revalidate=900"
        assert second.headers["vary"] == "Authorization"
        assert fake_db.calls == 1
    finally:
        player_directory_responses.clear()
        app.dependency_overrides.clear()


class DraftPoolDB:
    async def request(self, method, table, **kwargs):
        assert method == "GET"
        assert kwargs["params"]["limit"] == 1000
        assert kwargs["params"]["offset"] == 0
        if table == "player_external_ids":
            return ([{"player_id": "player-1", "external_id": "123"}], {})
        if table == "player_directory_cache":
            assert kwargs["params"]["season"] == "eq.2026"
            return ([{"id": "player-1", "name": "Draft Player"}], {})
        raise AssertionError(table)


def test_draft_pool_includes_espn_ids():
    app.dependency_overrides[db_for] = lambda: DraftPoolDB()
    try:
        response = client.get("/v1/draft/player-pool?season=2026")
        assert response.status_code == 200
        assert response.json() == {"items": [{"id": "player-1", "name": "Draft Player", "espn_id": "123", "sleeper_id": None}]}
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
            "player_directory_cache": [
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


class TransactionsDB:
    async def request(self, method, table, **kwargs):
        assert method == "GET"
        if table == "fantasy_teams":
            return ([{"id": "my-team"}], {})
        if table == "league_transactions":
            rows = [
                {"id": "incoming", "status": "PENDING", "transaction_type": "TRADE_PROPOSAL",
                 "initiated_by_team_id": "other-team", "items": [{"to_team_id": "my-team"}]},
                {"id": "outgoing", "status": "PENDING", "transaction_type": "TRADE_PROPOSAL",
                 "initiated_by_team_id": "my-team", "items": [{"from_team_id": "my-team"}]},
                {"id": "waiver", "status": "EXECUTED", "transaction_type": "WAIVER", "items": []},
                {"id": "failed", "status": "CANCELED", "transaction_type": "WAIVER", "items": []},
            ]
            if kwargs["params"]["status"] == "eq.PENDING":
                return ([row for row in rows if row["status"] == "PENDING"], {})
            assert kwargs["params"]["limit"] == 20
            assert kwargs["params"]["offset"] == 0
            assert kwargs["params"]["order"].startswith("proposed_at.desc")
            if "or" in kwargs["params"]:
                assert kwargs["params"]["or"].startswith("(proposed_at.gte.")
                assert ",processed_at.gte." in kwargs["params"]["or"]
            assert kwargs["prefer"] == "count=exact"
            return ([row for row in rows if row["status"] == "EXECUTED"], {"content-range": "0-0/1"})
        raise AssertionError(table)


def test_league_transactions_separate_trade_offers_and_completed_feed():
    app.dependency_overrides[db_for] = lambda: TransactionsDB()
    try:
        response = client.get("/v1/leagues/league-1/transactions?team_id=my-team")
        assert response.status_code == 200
        body = response.json()
        assert [row["id"] for row in body["incoming"]] == ["incoming"]
        assert [row["id"] for row in body["outgoing"]] == ["outgoing"]
        assert [row["id"] for row in body["league"]["items"]] == ["waiver"]
        assert body["league"] == {"items": body["league"]["items"], "page": 1, "page_size": 20, "total": 1, "total_pages": 1}
        assert client.get("/v1/leagues/league-1/transactions?team_id=my-team&time_range=7d").status_code == 200
    finally:
        app.dependency_overrides.clear()


class MatchupDB:
    async def request(self, method, table, **kwargs):
        assert method == "GET"
        rows = {
            "fantasy_teams": [{"id": "team-1", "name": "Alpha", "league": {
                "id": "league-1", "name": "Test League", "season": 2026,
                "current_week": 2, "last_synced_at": "2026-09-08T00:00:00Z",
            }}],
            "league_matchups": [{
                "id": "matchup-2", "week": 2, "home_team_id": "team-1", "away_team_id": "team-2",
                "home_team": {"id": "team-1", "name": "Alpha"},
                "away_team": {"id": "team-2", "name": "Beta"},
            }],
            "roster_snapshots": [
                {"id": "snapshot-1", "team_id": "team-1", "week": 2, "fetched_at": "now"},
                {"id": "snapshot-2", "team_id": "team-2", "week": 2, "fetched_at": "now"},
            ],
            "roster_players": [{"roster_snapshot_id": "snapshot-1", "lineup_slot": "QB",
                                "player": {"id": "player-1", "name": "QB One", "position": "QB"}}],
            "player_directory_cache": [{"id": "player-1", "projected_average_points": 21.5,
                                        "average_points": 20, "injury_status": None}],
            "player_snapshots": [{"player_id": "player-1", "week": 2, "total_points": 24.1,
                                  "projected_total_points": 21.2, "raw_payload": {}, "fetched_at": "now"}],
        }
        return rows[table], {}


def test_team_matchup_defaults_to_current_week_and_builds_lineups():
    app.dependency_overrides[db_for] = lambda: MatchupDB()
    try:
        response = client.get("/v1/teams/team-1/matchup")
        assert response.status_code == 200
        body = response.json()
        assert body["week"] == 2
        assert body["matchup"]["away_team"]["name"] == "Beta"
        assert body["lineups"]["team-1"][0]["projected_average_points"] == 21.5
        assert body["lineups"]["team-1"][0]["weekly_actual_points"] == 24.1
    finally:
        app.dependency_overrides.clear()


class DraftHistoryDB:
    async def request(self, method, table, **kwargs):
        if table == "rpc/link_league_history":
            assert method == "POST"
            return ([
                {"id": "league-2026", "season": 2026},
                {"id": "league-2025", "season": 2025},
            ], {})
        if table == "league_draft_picks":
            assert method == "GET"
            assert kwargs["params"]["league_id"] == "in.(league-2025)"
            assert kwargs["params"]["overall_pick"] == "gte.7"
            assert kwargs["params"]["and"] == "(overall_pick.lte.13)"
            return ([
                {"overall_pick": pick, "player_name": f"Player {pick}", "league": {"season": 2025}}
                for pick in range(7, 14)
            ], {})
        raise AssertionError(table)


def test_draft_history_returns_pick_neighborhood_and_available_seasons():
    app.dependency_overrides[db_for] = lambda: DraftHistoryDB()
    try:
        response = client.get("/v1/leagues/league-2026/draft-picks?season=2025&overall_pick=10&window=3")
        assert response.status_code == 200
        body = response.json()
        assert body["available_seasons"] == [2026, 2025]
        assert [pick["overall_pick"] for pick in body["items"]] == list(range(7, 14))
    finally:
        app.dependency_overrides.clear()


def test_draft_history_requires_season_for_pick_neighborhood():
    app.dependency_overrides[db_for] = lambda: DraftHistoryDB()
    try:
        response = client.get("/v1/leagues/league-2026/draft-picks?overall_pick=10")
        assert response.status_code == 400
    finally:
        app.dependency_overrides.clear()


class PlayerDetailDB:
    async def request(self, method, table, **kwargs):
        rows = {
            "players": [{"id": "player-1", "name": "Test Player"}],
            "player_snapshots": [
                {"id": "snapshot-1", "source": "espn", "season": 2026,
                 "projected_total_points": 255, "fetched_at": "2026-08-23T00:00:00Z"},
                {"id": "snapshot-2", "source": "fftoday", "season": 2026,
                 "projected_total_points": 289, "raw_payload": {"scoring_format": "ppr"},
                 "fetched_at": "2026-08-23T00:00:00Z"},
            ],
            "player_rankings": [
                {"id": "rank-1", "source": "espn", "overall_rank": 10, "scoring_format": "ppr",
                 "ranking_type": "current_draft_rank", "fetched_at": "2026-08-23T00:00:00Z"},
                {"id": "rank-2", "source": "fantasypros", "overall_rank": 20, "scoring_format": "ppr",
                 "ranking_type": "expert_consensus_rank", "fetched_at": "2026-08-23T00:00:00Z"},
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
        assert body["projections"]["projected_total_points"] == 272.0
        assert body["projections"]["projected_average_points"] == 16.0
        assert body["projections"]["source_count"] == 2
        assert body["rankings"]["summary"] == {
            "average": 15.0, "median": 15.0, "minimum": 10.0,
            "maximum": 20.0, "source_count": 2,
        }
        assert body["sources"][0]["source"] == "reddit"
    finally:
        app.dependency_overrides.clear()


def test_projection_summary_uses_latest_compatible_cumulative_value_per_source():
    summary = projection_summary([
        {"source": "espn", "projected_total_points": 250, "fetched_at": "2026-08-24T00:00:00Z"},
        {"source": "espn", "projected_total_points": 240, "fetched_at": "2026-08-20T00:00:00Z"},
        {"source": "fftoday", "projected_total_points": 284,
         "raw_payload": {"scoring_format": "ppr"}, "fetched_at": "2026-08-23T00:00:00Z"},
        {"source": "other", "projected_total_points": 999,
         "raw_payload": {"scoring_format": "standard"}, "fetched_at": "2026-08-24T00:00:00Z"},
    ])
    assert summary["projected_total_points"] == 267.0
    assert summary["projected_average_points"] == 267.0 / 17
    assert summary["source_count"] == 2
    assert [source["source"] for source in summary["sources"]] == ["espn", "fftoday"]


def test_ranking_summary_includes_sleeper_platform_adp():
    summary = ranking_summary([
        {"source": "espn", "ranking_type": "current_draft_rank", "scoring_format": "ppr", "overall_rank": 10, "fetched_at": "2026-09-01T00:00:00Z"},
        {"source": "sleeper", "ranking_type": "platform_adp", "scoring_format": "ppr", "overall_rank": 20, "fetched_at": "2026-09-01T00:00:00Z"},
        {"source": "fantasypros", "ranking_type": "expert_consensus_rank", "scoring_format": "ppr", "overall_rank": 30, "fetched_at": "2026-09-01T00:00:00Z"},
    ])
    assert summary == {"average": 20.0, "median": 20.0, "minimum": 10.0, "maximum": 30.0, "source_count": 3}


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
        raise AssertionError(table)


def test_my_leagues_presents_linked_leagues_without_ingestion_queue_state():
    app.dependency_overrides[current_user] = lambda: AuthenticatedUser(id="user-1", token="token")
    app.dependency_overrides[db_for] = lambda: LeagueStateDB()
    try:
        response = client.get("/v1/me/leagues")
        assert response.status_code == 200
        by_external_id = {item["league"]["external_id"]: item for item in response.json()}
        assert set(by_external_id) == {"111"}
        assert by_external_id["111"]["state"] == "available"
        assert by_external_id["111"]["league"]["id"] == "league-1"
    finally:
        app.dependency_overrides.clear()
