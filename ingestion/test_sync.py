from ingestion.sync import clean_number, digest, parse_json, parser


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
