from pathlib import Path

import pytest

from pipelines.ingestion.sync import (
    ProviderContractError,
    chunks,
    canonical_sleeper_candidates,
    clean_number,
    digest,
    espn_matchup_rows,
    parse_espn_html,
    parse_espn_draft_rank,
    parse_fantasypros_html,
    parse_fantasypros_rankings,
    parse_fftoday_projections,
    parse_json,
    normalize_espn_transaction,
    parser,
    normalize_player_name,
    player_identity_matches,
    resolve_sleeper_player,
    snapshot_payload,
)


FIXTURES = Path(__file__).parent / "fixtures"


def test_legacy_helpers_tolerate_missing_values():
    assert clean_number("") is None
    assert clean_number("12.5") == 12.5
    assert clean_number("4") == 4
    assert parse_json("not json", {}) == {}
    assert digest({"b": 2, "a": 1}) == digest({"a": 1, "b": 2})
    assert normalize_player_name("James Cook III") == normalize_player_name("James Cook")
    assert player_identity_matches({"name": "James Cook III", "position": "RB"}, "James Cook", "RB")
    assert not player_identity_matches({"name": "Ryan Izzo", "position": "TE"}, "Tyler Conklin", "TE")


def test_snapshot_normalizes_espn_array_placeholders():
    class Player:
        posRank = []
        injuryStatus = None
        injured = False
        total_points = 0
        avg_points = []
        projected_total_points = []
        projected_avg_points = []
        percent_owned = []
        percent_started = []
        eligibleSlots = []
        lineupSlot = None
        acquisitionType = None
        stats = []
        onTeamId = None

    payload = snapshot_payload("00000000-0000-0000-0000-000000000000", Player(), 2026, None, "2026-08-29T00:00:00Z")
    assert payload["position_rank"] is None
    assert payload["projected_total_points"] is None
    assert payload["percent_owned"] is None


def test_global_parser_is_2026_ready(monkeypatch):
    monkeypatch.setenv("ESPN_SEED_LEAGUE_ID", "123456")
    args = parser().parse_args(["sync-global", "--season", "2026", "--league-id", "123456"])
    assert args.season == 2026
    assert args.free_agents == 2000
    assert args.sources is False


def test_league_parser_supports_daily_linked_refresh():
    args = parser().parse_args(["sync-league", "--season", "2026", "--all-linked"])
    assert args.season == 2026
    assert args.all_linked is True


def test_league_parser_supports_full_history_backfill():
    args = parser().parse_args([
        "sync-league", "--season", "2026", "--league-id", "123456", "--history"
    ])
    assert args.history is True


def test_cli_supports_sleeper_league_and_global_data():
    league_args = parser().parse_args([
        "sync-league", "--provider", "sleeper", "--season", "2026",
        "--league-id", "123456789", "--history",
    ])
    global_args = parser().parse_args([
        "sync-global", "--season", "2026", "--league-id", "123", "--sleeper",
    ])
    assert league_args.provider == "sleeper"
    assert league_args.history is True
    assert global_args.sleeper is True


def test_batches_are_stable():
    assert list(chunks(list(range(5)), 2)) == [[0, 1], [2, 3], [4]]


def test_duplicate_sleeper_ids_prefer_espn_linked_candidate():
    candidates = {
        "new": {"full_name": "Chase Cota", "position": "WR", "college": "Oregon"},
        "canonical": {"full_name": "Chase Cota", "position": "WR", "college": "Oregon"},
        "other-person": {"full_name": "Chase Cota", "position": "WR", "college": "USC"},
    }
    selected = canonical_sleeper_candidates(
        candidates, {"canonical": "player-with-espn"}, {"player-with-espn"}, {}, {})
    assert set(selected) == {"canonical", "other-person"}


def test_sleeper_roster_player_reuses_locked_canonical_identity():
    class DB:
        def __init__(self):
            self.inserted = []

        def select(self, table, **filters):
            if table == "player_external_ids" and filters.get("provider") == "sleeper":
                return []
            if table == "player_external_ids" and filters.get("provider") == "espn":
                return []
            if table == "players":
                assert filters == {"identity_key": "tylerloop:K", "identity_locked": "true"}
                return [{"id": "canonical-player"}]
            if table == "player_external_ids" and filters.get("player_id") == "canonical-player":
                return []
            raise AssertionError((table, filters))

        def insert(self, table, payload):
            self.inserted.append((table, payload))
            return [payload]

        def patch(self, *_args, **_kwargs):
            raise AssertionError("existing external ID path should not be used")

    db = DB()
    player_id = resolve_sleeper_player(db, "11586", {
        "player_id": "11586", "full_name": "Tyler Loop", "position": "K", "team": "BAL", "active": True,
    })

    assert player_id == "canonical-player"
    assert db.inserted == [("player_external_ids", {
        "player_id": "canonical-player", "provider": "sleeper", "external_id": "11586",
    })]


def test_pending_espn_trade_is_normalized_with_direction_and_dates():
    transaction, items = normalize_espn_transaction({
        "id": "trade-1", "isPending": True, "proposedByTeamId": 2,
        "proposedDate": 1788796800000, "expirationDate": 1788883200000,
        "items": [
            {"type": "TRADE", "playerId": 101, "fromTeamId": 2, "toTeamId": 7},
            {"type": "TRADE", "playerId": 202, "fromTeamId": 7, "toTeamId": 2},
        ],
    }, "league-1", {"2": {"id": "team-2"}, "7": {"id": "team-7"}}, "2026-09-07T00:00:00Z")
    assert transaction["transaction_type"] == "TRADE_PROPOSAL"
    assert transaction["status"] == "PENDING"
    assert transaction["initiated_by_team_id"] == "team-2"
    assert transaction["proposed_at"] == "2026-09-07T16:00:00+00:00"
    assert items[0]["from_team_id"] == "team-2"
    assert items[0]["to_team_id"] == "team-7"


def test_completed_waiver_preserves_faab_and_player_movement():
    transaction, items = normalize_espn_transaction({
        "id": "waiver-1", "type": "WAIVER", "status": "EXECUTED", "teamId": 7,
        "processDate": 1788796800000, "bidAmount": 14,
        "items": [{"type": "ADD", "playerId": 303, "toTeamId": 7}],
    }, "league-1", {"7": {"id": "team-7"}}, "2026-09-07T00:00:00Z")
    assert transaction["transaction_type"] == "WAIVER"
    assert transaction["bid_amount"] == 14
    assert items == [{
        "item_index": 0, "item_type": "ADD", "player_external_id": "303",
        "from_team_id": None, "from_team_external_id": None,
        "to_team_id": "team-7", "to_team_external_id": "7",
        "raw_payload": {"type": "ADD", "playerId": 303, "toTeamId": 7},
    }]
def test_espn_schedule_normalizes_head_to_head_matchups():
    rows = espn_matchup_rows([{
        "id": 101, "matchupPeriodId": 1, "winner": "HOME",
        "home": {"teamId": 1, "totalPoints": 124.5, "totalProjectedPointsLive": 119.2},
        "away": {"teamId": 2, "totalPoints": 110.1, "totalProjectedPointsLive": 115.8},
    }], "league-1", 2026, {"1": {"id": "home"}, "2": {"id": "away"}}, "now")
    assert rows[0]["home_team_id"] == "home"
    assert rows[0]["away_projected"] == 115.8
    assert rows[0]["status"] == "final"


def test_provider_contract_fixtures_extract_content():
    fantasypros = parse_fantasypros_html((FIXTURES / "fantasypros_player.html").read_text())
    espn = parse_espn_html((FIXTURES / "espn_player.html").read_text())
    assert "healthy" in fantasypros
    assert "practice" in espn


def test_espn_draft_rank_uses_requested_format_with_fallback():
    player = {"draftRanksByRankType": {"PPR": {"rank": 12}, "STANDARD": {"rank": 18}}}
    assert parse_espn_draft_rank(player, "PPR") == 12
    assert parse_espn_draft_rank(player, "STANDARD") == 18
    assert parse_espn_draft_rank(player, "SUPERFLEX") == 12


def test_fftoday_projection_contract_extracts_attributed_rows():
    rows = "".join(
        f'''<tr><td></td><td><a href="/stats/players/{1000 + index}/Player_{index}?LeagueID=107644">Player {index}</a></td><td>NYJ</td><td>9</td><td>{100 + index}</td><td>{200 + index}</td><td>{10 + index}</td><td>{250 + index}.5</td></tr>'''
        for index in range(10)
    )
    html = f'''<html><td class="update">Regular Season, Updated: 8/20/2026</td><table>{rows}</table></html>'''
    parsed = parse_fftoday_projections(html, "RB", "https://www.fftoday.com/example")
    assert len(parsed) == 10
    assert parsed[0]["external_id"] == "1000"
    assert parsed[0]["position_rank"] == 1
    assert parsed[0]["projected_total_points"] == 250.5
    assert parsed[0]["source_updated_at"] == "2026-08-20T00:00:00+00:00"


def test_fftoday_projection_contract_fails_closed():
    with pytest.raises(ProviderContractError):
        parse_fftoday_projections("<html></html>", "WR", "https://www.fftoday.com/example")


def test_fantasypros_rankings_extract_overall_and_position_rank():
    players = [
        {"player_id": 2000 + index, "player_name": f"Player {index}", "player_team_id": "BUF",
         "player_position_id": "WR", "rank_ecr": index + 1, "pos_rank": f"WR{index + 1}"}
        for index in range(100)
    ]
    payload = {"year": "2026", "scoring": "PPR", "last_updated": "8/24", "players": players}
    html = f"<script>var ecrData = {__import__('json').dumps(payload)};\n</script>"
    parsed = parse_fantasypros_rankings(html, 2026, "https://www.fantasypros.com/example")
    assert len(parsed) == 100
    assert parsed[0]["overall_rank"] == 1
    assert parsed[0]["position_rank"] == 1
    assert parsed[0]["source_updated_at"] == "2026-08-24T00:00:00+00:00"


@pytest.mark.parametrize("parser", [parse_fantasypros_html, parse_espn_html])
def test_provider_contracts_fail_clearly(parser):
    with pytest.raises(ProviderContractError):
        parser("<html><body>upstream redesign</body></html>")
