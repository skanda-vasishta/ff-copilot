---
name: refresh-ff-copilot-data
description: Refresh and verify FF Copilot's Supabase-backed 2026 player projections, ESPN rankings and snapshots, FFToday projections, FantasyPros rankings, Reddit/source documents, linked ESPN leagues, rosters, standings, draft history, and pending league requests. Use when data looks stale, a player or league is missing, source freshness is questioned, or an operator asks to rerun all ingestion/data jobs.
---

# Refresh FF Copilot Data

Run the repository's existing ingestion CLI against production Supabase, then verify coverage and report partial failures. Never print credential values.

## Locate credentials

1. Run commands from the repository root containing `pipelines/ingestion/sync.py`.
2. Use the ignored `.env` only when it defines `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `ESPN_SEED_LEAGUE_ID`. Check names without displaying values.
3. Prefer `.venv/bin/python`; otherwise install `pipelines/ingestion/requirements.txt` into an isolated environment.

## Run the complete refresh

Load `.env` without echoing it. Run sequentially:

```bash
.venv/bin/python -m pipelines.ingestion.sync sync-global --season 2026 --fftoday --fantasypros-rankings --sources --source-player-limit 450
.venv/bin/python -m pipelines.ingestion.sync sync-league --season 2026 --all-linked
.venv/bin/python -m pipelines.ingestion.sync sync-league --season 2026 --pending
```

The global command refreshes ESPN player facts and the additional ranking, projection, and source datasets. The league commands refresh every linked league and unresolved request.

## Verify

```bash
.venv/bin/python -m pipelines.ingestion.sync coverage-report --season 2026 --minimum-players 250 --maximum-snapshot-age-hours 2
```

Treat coverage failure or a nonzero exit as incomplete. Report partial provider failures separately; unmatched aliases do not invalidate successfully persisted players. Preserve the last valid snapshots and never delete rows to force freshness.

Report command status, coverage, freshness, source failures, league results, and whether another run or code fix is required.

## GitHub Actions fallback

If local production credentials are unavailable, dispatch `Sync global player data` with `season=2026` and `include_sources=true`. Then reproduce both league operations (`--all-linked` and `--pending`); a manual workflow dispatch with no league ID only performs pending requests.

Do not claim freshness until the jobs finish and coverage verification passes.
