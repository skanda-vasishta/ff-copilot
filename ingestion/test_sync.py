from pathlib import Path

import pytest

from ingestion.sync import (
    ProviderContractError,
    chunks,
    clean_number,
    digest,
    parse_espn_html,
    parse_fantasypros_html,
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
    assert args.sources is False


def test_batches_are_stable():
    assert list(chunks(list(range(5)), 2)) == [[0, 1], [2, 3], [4]]


def test_provider_contract_fixtures_extract_content():
    fantasypros = parse_fantasypros_html((FIXTURES / "fantasypros_player.html").read_text())
    espn = parse_espn_html((FIXTURES / "espn_player.html").read_text())
    assert "healthy" in fantasypros
    assert "practice" in espn


@pytest.mark.parametrize("parser", [parse_fantasypros_html, parse_espn_html])
def test_provider_contracts_fail_clearly(parser):
    with pytest.raises(ProviderContractError):
        parser("<html><body>upstream redesign</body></html>")
