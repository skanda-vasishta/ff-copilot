from services.api.nflverse import aggregate_game_rows, merge_canonical_player_stats, number


def play(**values):
    row = {
        "game_id": "2026_01_NE_SEA", "season": "2026", "week": "1", "season_type": "REG",
        "game_date": "2026-09-09", "home_team": "SEA", "away_team": "NE",
        "home_score": "13", "away_score": "10", "posteam": "NE", "defteam": "SEA",
    }
    row.update({key: str(value) if value is not None else "" for key, value in values.items()})
    return row


def test_number_rejects_missing_and_non_finite_values():
    assert number("") is None
    assert number("NaN") is None
    assert number("inf") is None
    assert number("12") == 12
    assert number("1.25") == 1.25


def test_aggregate_game_rows_builds_detailed_offense_and_defense_lines():
    rows = [
        play(
            passer_player_id="qb", passer_player_name="Q.Back", receiver_player_id="wr",
            receiver_player_name="W.Receiver", pass_attempt=1, complete_pass=1, passing_yards=18,
            receiving_yards=18, pass_touchdown=1, air_yards=12, yards_after_catch=6,
            epa=2.5, first_down_pass=1, solo_tackle_1_player_id="db",
            solo_tackle_1_player_name="D.Back", qb_hit_1_player_id="edge",
            qb_hit_1_player_name="E.Rusher",
        ),
        play(
            rusher_player_id="rb", rusher_player_name="R.Back", rush_attempt=1,
            rushing_yards=7, first_down_rush=1, epa=.8,
            tackle_for_loss_1_player_id="edge", tackle_for_loss_1_player_name="E.Rusher",
        ),
        play(desc="END GAME"),
    ]
    game, players = aggregate_game_rows(rows)
    by_id = {row["gsis_id"]: row for row in players}

    assert game["status"] == "final"
    assert game["raw_payload"]["play_count"] == 3
    assert by_id["qb"]["stats"] == {
        "qb_dropbacks": 1.0, "pass_attempts": 1.0, "completions": 1.0, "passing_yards": 18.0,
        "passing_touchdowns": 1.0, "interceptions": 0.0, "sacks_taken": 0.0,
        "passing_air_yards": 12.0, "passing_yards_after_catch": 6.0,
        "passing_epa": 2.5, "passing_first_downs": 1.0,
    }
    assert by_id["wr"]["stats"]["target_share"] == 1.0
    assert by_id["wr"]["stats"]["air_yards_share"] == 1.0
    assert by_id["rb"]["stats"]["rushing_first_downs"] == 1.0
    assert by_id["db"]["stats"]["solo_tackles"] == 1.0
    assert by_id["edge"]["stats"] == {"qb_hits": 1.0, "tackles_for_loss": 1.0}


def test_canonical_player_stats_override_pbp_edge_cases_without_losing_advanced_fields():
    player_games = [{
        "game_id": "2026_01_NE_SEA", "gsis_id": "qb", "team": "NE",
        "stats": {"pass_attempts": 40, "qb_dropbacks": 43, "custom_pbp_stat": 2},
    }]
    merged = merge_canonical_player_stats(player_games, [{
        "season": "2026", "week": "1", "player_id": "qb", "recent_team": "NE",
        "attempts": "39", "passing_yards": "250", "fantasy_points_ppr": "18.5",
    }], 2026)
    assert merged == 1
    assert player_games[0]["stats"] == {
        "pass_attempts": 39, "passing_yards": 250, "fantasy_points_ppr": 18.5,
        "qb_dropbacks": 43, "custom_pbp_stat": 2,
    }
