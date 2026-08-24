from pathlib import Path

import pytest

from pipelines.ingestion.sync import (
    ProviderContractError,
    chunks,
    clean_number,
    digest,
    parse_espn_html,
    parse_espn_draft_rank,
    parse_fantasypros_html,
    parse_fantasypros_rankings,
    parse_fftoday_projections,
    parse_json,
    parser,
)


FIXTURES = Path(__file__).parent / "fixtures"


def test_legacy_helpers_tolerate_missing_values():
    assert clean_number("") is None
    assert clean_number("12.5") == 12.5
    assert clean_number("4") == 4
    assert parse_json("not json", {}) == {}
    assert digest({"b": 2, "a": 1}) == digest({"a": 1, "b": 2})


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


def test_batches_are_stable():
    assert list(chunks(list(range(5)), 2)) == [[0, 1], [2, 3], [4]]


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
