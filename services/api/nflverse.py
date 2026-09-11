import csv
import gzip
import io
import math
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

import httpx


PBP_URL = "https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_{season}.csv.gz"
PLAYERS_URL = "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv.gz"
PLAYER_STATS_URL = "https://github.com/nflverse/nflverse-data/releases/download/player_stats/player_stats.csv.gz"

CANONICAL_STAT_FIELDS = {
    "completions": "completions", "attempts": "pass_attempts", "passing_yards": "passing_yards",
    "passing_tds": "passing_touchdowns", "interceptions": "interceptions", "sacks": "sacks_taken",
    "passing_air_yards": "passing_air_yards", "passing_yards_after_catch": "passing_yards_after_catch",
    "passing_first_downs": "passing_first_downs", "passing_epa": "passing_epa",
    "passing_2pt_conversions": "passing_2pt_conversions", "pacr": "pacr", "dakota": "dakota",
    "carries": "carries", "rushing_yards": "rushing_yards", "rushing_tds": "rushing_touchdowns",
    "rushing_fumbles": "rushing_fumbles", "rushing_fumbles_lost": "rushing_fumbles_lost",
    "rushing_first_downs": "rushing_first_downs", "rushing_epa": "rushing_epa",
    "rushing_2pt_conversions": "rushing_2pt_conversions", "receptions": "receptions", "targets": "targets",
    "receiving_yards": "receiving_yards", "receiving_tds": "receiving_touchdowns",
    "receiving_fumbles": "receiving_fumbles", "receiving_fumbles_lost": "receiving_fumbles_lost",
    "receiving_air_yards": "receiving_air_yards", "receiving_yards_after_catch": "receiving_yards_after_catch",
    "receiving_first_downs": "receiving_first_downs", "receiving_epa": "receiving_epa",
    "receiving_2pt_conversions": "receiving_2pt_conversions", "racr": "racr",
    "target_share": "target_share", "air_yards_share": "air_yards_share", "wopr": "wopr",
    "special_teams_tds": "special_teams_touchdowns", "fantasy_points": "fantasy_points",
    "fantasy_points_ppr": "fantasy_points_ppr",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def number(value: Any) -> float | int | None:
    if value in (None, "", "NA", "NaN", "nan"):
        return None
    try:
        result = float(value)
        if not math.isfinite(result):
            return None
        return int(result) if result.is_integer() else result
    except (TypeError, ValueError):
        return None


def flag(row: dict[str, str], field: str) -> int:
    return 1 if number(row.get(field)) == 1 else 0


def add(stats: dict[str, float], field: str, value: Any) -> None:
    parsed = number(value)
    if parsed is not None:
        stats[field] += float(parsed)


def player_bucket(players: dict[str, dict[str, Any]], gsis_id: str | None, name: str | None,
                  team: str | None, opponent: str | None) -> dict[str, Any] | None:
    if not gsis_id or not name:
        return None
    item = players.setdefault(gsis_id, {
        "gsis_id": gsis_id, "player_name": name, "team": team,
        "opponent_team": opponent, "stats": defaultdict(float),
    })
    if not item.get("team") and team:
        item["team"] = team
        item["opponent_team"] = opponent
    return item


def aggregate_game_rows(rows: list[dict[str, str]]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Aggregate nflverse PBP into a game record and detailed player game lines."""
    first = rows[0]
    home, away = first["home_team"], first["away_team"]
    game = {
        "game_id": first["game_id"], "season": int(first["season"]),
        "week": int(first["week"]), "season_type": first["season_type"],
        "game_date": first.get("game_date") or None, "home_team": home, "away_team": away,
        "home_score": number(first.get("home_score")), "away_score": number(first.get("away_score")),
        "status": "final" if any((row.get("desc") or "").strip() == "END GAME" for row in rows) else "in_progress",
        "raw_payload": {"play_count": len(rows)},
    }
    players: dict[str, dict[str, Any]] = {}
    team_targets: dict[str, int] = defaultdict(int)
    team_air_yards: dict[str, float] = defaultdict(float)

    for row in rows:
        offense, defense = row.get("posteam"), row.get("defteam")
        if row.get("play_type") == "no_play" or flag(row, "play_deleted"):
            continue
        passer = player_bucket(players, row.get("passer_player_id"), row.get("passer_player_name"), offense, defense)
        receiver = player_bucket(players, row.get("receiver_player_id"), row.get("receiver_player_name"), offense, defense)
        rusher = player_bucket(players, row.get("rusher_player_id"), row.get("rusher_player_name"), offense, defense)

        if passer:
            stats = passer["stats"]
            # nflverse marks sacks as pass attempts for analytical dropback
            # purposes; conventional box scores do not.
            add(stats, "qb_dropbacks", flag(row, "pass_attempt"))
            add(stats, "pass_attempts", 1 if flag(row, "pass_attempt") and not flag(row, "sack")
                and not flag(row, "two_point_attempt") else 0)
            add(stats, "completions", flag(row, "complete_pass"))
            add(stats, "passing_yards", row.get("passing_yards"))
            add(stats, "passing_touchdowns", flag(row, "pass_touchdown"))
            add(stats, "interceptions", flag(row, "interception"))
            add(stats, "sacks_taken", flag(row, "sack"))
            add(stats, "passing_air_yards", row.get("air_yards"))
            add(stats, "passing_yards_after_catch", row.get("yards_after_catch"))
            add(stats, "passing_epa", row.get("epa"))
            add(stats, "passing_first_downs", flag(row, "first_down_pass"))
        if receiver and flag(row, "pass_attempt") and not flag(row, "two_point_attempt"):
            stats = receiver["stats"]
            add(stats, "targets", 1)
            add(stats, "receptions", flag(row, "complete_pass"))
            add(stats, "receiving_yards", row.get("receiving_yards"))
            add(stats, "receiving_touchdowns", flag(row, "pass_touchdown"))
            add(stats, "receiving_air_yards", row.get("air_yards"))
            add(stats, "receiving_yards_after_catch", row.get("yards_after_catch"))
            add(stats, "receiving_epa", row.get("epa"))
            add(stats, "receiving_first_downs", flag(row, "first_down_pass"))
            team_targets[offense or ""] += 1
            add(team_air_yards, offense or "", row.get("air_yards"))
        if rusher and flag(row, "rush_attempt") and not flag(row, "two_point_attempt"):
            stats = rusher["stats"]
            add(stats, "carries", 1)
            add(stats, "rushing_yards", row.get("rushing_yards"))
            add(stats, "rushing_touchdowns", flag(row, "rush_touchdown"))
            add(stats, "rushing_epa", row.get("epa"))
            add(stats, "rushing_first_downs", flag(row, "first_down_rush"))

        # Defensive involvement. nflverse has separate IDs for these events.
        defensive_fields = (
            ("solo_tackle_1_player_id", "solo_tackle_1_player_name", "solo_tackles", 1),
            ("solo_tackle_2_player_id", "solo_tackle_2_player_name", "solo_tackles", 1),
            ("assist_tackle_1_player_id", "assist_tackle_1_player_name", "assisted_tackles", 1),
            ("assist_tackle_2_player_id", "assist_tackle_2_player_name", "assisted_tackles", 1),
            ("assist_tackle_3_player_id", "assist_tackle_3_player_name", "assisted_tackles", 1),
            ("assist_tackle_4_player_id", "assist_tackle_4_player_name", "assisted_tackles", 1),
            ("sack_player_id", "sack_player_name", "sacks", 1),
            ("half_sack_1_player_id", "half_sack_1_player_name", "sacks", .5),
            ("half_sack_2_player_id", "half_sack_2_player_name", "sacks", .5),
            ("qb_hit_1_player_id", "qb_hit_1_player_name", "qb_hits", 1),
            ("qb_hit_2_player_id", "qb_hit_2_player_name", "qb_hits", 1),
            ("tackle_for_loss_1_player_id", "tackle_for_loss_1_player_name", "tackles_for_loss", 1),
            ("tackle_for_loss_2_player_id", "tackle_for_loss_2_player_name", "tackles_for_loss", 1),
            ("pass_defense_1_player_id", "pass_defense_1_player_name", "passes_defended", 1),
            ("pass_defense_2_player_id", "pass_defense_2_player_name", "passes_defended", 1),
            ("interception_player_id", "interception_player_name", "defensive_interceptions", 1),
            ("forced_fumble_player_1_player_id", "forced_fumble_player_1_player_name", "forced_fumbles", 1),
            ("forced_fumble_player_2_player_id", "forced_fumble_player_2_player_name", "forced_fumbles", 1),
            ("fumble_recovery_1_player_id", "fumble_recovery_1_player_name", "fumble_recoveries", 1),
            ("fumble_recovery_2_player_id", "fumble_recovery_2_player_name", "fumble_recoveries", 1),
        )
        for id_field, name_field, stat, amount in defensive_fields:
            defender = player_bucket(players, row.get(id_field), row.get(name_field), defense, offense)
            if defender:
                add(defender["stats"], stat, amount)

        for index in ("1", "2"):
            fumbler = player_bucket(players, row.get(f"fumbled_{index}_player_id"),
                                    row.get(f"fumbled_{index}_player_name"), offense, defense)
            if fumbler:
                add(fumbler["stats"], "fumbles", 1)
                if flag(row, "fumble_lost"):
                    add(fumbler["stats"], "fumbles_lost", 1)

        kicker = player_bucket(players, row.get("kicker_player_id"), row.get("kicker_player_name"), offense, defense)
        if kicker:
            if flag(row, "field_goal_attempt"):
                add(kicker["stats"], "field_goal_attempts", 1)
                add(kicker["stats"], "field_goals_made", 1 if row.get("field_goal_result") == "made" else 0)
                add(kicker["stats"], "field_goal_yards", row.get("kick_distance"))
            if flag(row, "extra_point_attempt"):
                add(kicker["stats"], "extra_point_attempts", 1)
                add(kicker["stats"], "extra_points_made", 1 if row.get("extra_point_result") == "good" else 0)

        punter = player_bucket(players, row.get("punter_player_id"), row.get("punter_player_name"), offense, defense)
        if punter and flag(row, "punt_attempt"):
            add(punter["stats"], "punts", 1)
            add(punter["stats"], "punt_yards", row.get("kick_distance"))
            add(punter["stats"], "punts_inside_20", flag(row, "punt_inside_twenty"))
            add(punter["stats"], "touchbacks", flag(row, "touchback"))

        for prefix in ("punt", "kickoff"):
            returner = player_bucket(players, row.get(f"{prefix}_returner_player_id"),
                                     row.get(f"{prefix}_returner_player_name"), offense, defense)
            if returner and number(row.get("return_yards")) is not None:
                add(returner["stats"], f"{prefix}_returns", 1)
                add(returner["stats"], f"{prefix}_return_yards", row.get("return_yards"))
                if flag(row, "return_touchdown"):
                    add(returner["stats"], f"{prefix}_return_touchdowns", 1)

    output = []
    for item in players.values():
        stats = dict(item.pop("stats"))
        targets = stats.get("targets", 0)
        air = stats.get("receiving_air_yards", 0)
        team = item.get("team") or ""
        if targets:
            stats["target_share"] = targets / team_targets[team] if team_targets[team] else None
        if air and team_air_yards[team]:
            stats["air_yards_share"] = air / team_air_yards[team]
        stats = {key: round(value, 6) if isinstance(value, float) else value for key, value in stats.items()}
        output.append({**item, "stats": stats})
    return game, output


async def download_csv(url: str) -> tuple[list[dict[str, str]], str | None]:
    async with httpx.AsyncClient(timeout=90, follow_redirects=True) as client:
        response = await client.get(url)
    response.raise_for_status()
    modified = response.headers.get("last-modified")
    content = gzip.decompress(response.content) if url.endswith(".gz") else response.content
    return list(csv.DictReader(io.StringIO(content.decode("utf-8")))), modified


async def load_nflverse_season(season: int) -> tuple[list[dict[str, Any]], list[dict[str, Any]], str | None]:
    rows, modified = await download_csv(PBP_URL.format(season=season))
    rows = [row for row in rows if number(row.get("season")) == season and row.get("game_id")]
    if not rows:
        raise RuntimeError(f"nflverse returned no play-by-play rows for {season}")
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        grouped[row["game_id"]].append(row)
    games, player_games = [], []
    for game_rows in grouped.values():
        game, players = aggregate_game_rows(game_rows)
        games.append(game)
        player_games.extend({"game_id": game["game_id"], **player} for player in players)
    return games, player_games, modified


def merge_canonical_player_stats(player_games: list[dict[str, Any]], rows: list[dict[str, str]], season: int) -> int:
    """Prefer nflverse's corrected weekly offense while retaining PBP-only defense/kicking."""
    by_key = {(item["gsis_id"], item["game_id"].split("_")[1], item.get("team")): item for item in player_games}
    merged = 0
    for row in rows:
        if number(row.get("season")) != season:
            continue
        item = by_key.get((row.get("player_id"), str(row.get("week", "")).zfill(2), row.get("recent_team")))
        if not item:
            continue
        for source, target in CANONICAL_STAT_FIELDS.items():
            value = number(row.get(source))
            if value is not None:
                item["stats"][target] = value
        merged += 1
    return merged
