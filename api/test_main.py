from fastapi.testclient import TestClient

from main import app, db_for, source_freshness


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


def test_source_freshness_counts_unique_players_and_latest_fetch():
    summary = source_freshness([
        {"source": "espn", "player_id": "one", "fetched_at": "2026-08-01T00:00:00Z"},
        {"source": "espn", "player_id": "one", "fetched_at": "2026-08-02T00:00:00Z"},
        {"source": "espn", "player_id": "two", "fetched_at": "2026-08-01T00:00:00Z"},
    ])
    assert summary == {"espn": {"latest_fetched_at": "2026-08-02T00:00:00Z", "player_count": 2}}
