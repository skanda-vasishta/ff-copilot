from fastapi.testclient import TestClient

from services.api.main import app, db_for


client = TestClient(app)


class NFLReadDB:
    async def request(self, method, table, **kwargs):
        assert method == "GET"
        params = kwargs["params"]
        if table == "nfl_games":
            if params.get("game_id"):
                return ([{
                    "game_id": "2026_01_NE_SEA", "season": 2026, "week": 1,
                    "source": "nflverse", "source_updated_at": "2026-09-10T13:20:51Z",
                    "fetched_at": "2026-09-10T14:00:00Z",
                }], {})
            assert params["or"] == "(home_team.eq.NE,away_team.eq.NE)"
            return ([{"game_id": "2026_01_NE_SEA", "season": 2026, "week": 1}], {})
        if table == "nfl_player_game_stats":
            if params.get("game_id"):
                return ([{"game_id": "2026_01_NE_SEA", "gsis_id": "00-1", "stats": {"targets": 8}}], {})
            assert params["game.season"] == "eq.2026"
            assert params["game.week"] == "eq.1"
            return ([{"game_id": "2026_01_NE_SEA", "player_id": "player-1", "stats": {"targets": 8}}], {})
        if table == "players":
            return ([{"id": "player-1", "name": "Player One"}], {})
        raise AssertionError(table)


def test_game_lookup_normalizes_team_and_box_score_includes_freshness():
    app.dependency_overrides[db_for] = lambda: NFLReadDB()
    try:
        games = client.get("/v1/nfl/games?season=2026&week=1&team=ne")
        assert games.status_code == 200
        assert games.json()["items"][0]["game_id"] == "2026_01_NE_SEA"

        box = client.get("/v1/nfl/games/2026_01_NE_SEA/box-score")
        assert box.status_code == 200
        assert box.json()["players"][0]["stats"]["targets"] == 8
        assert box.json()["freshness"]["source"] == "nflverse"
    finally:
        app.dependency_overrides.clear()

def test_player_game_log_is_scoped_by_internal_player_season_and_week():
    app.dependency_overrides[db_for] = lambda: NFLReadDB()
    try:
        response = client.get("/v1/players/player-1/games?season=2026&week=1")
        assert response.status_code == 200
        assert response.json()["items"][0]["stats"] == {"targets": 8}
    finally:
        app.dependency_overrides.clear()
