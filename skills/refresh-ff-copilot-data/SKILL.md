---
name: refresh-ff-copilot-data
description: Refresh and verify FF Copilot's Supabase-backed global player projections, rankings, injuries, and source documents. User league, roster, and standings refreshes are owned by authenticated app routes and must not be run as scheduled ingestion.
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
```

The global command refreshes ESPN player facts and the additional ranking, projection, and source datasets. Refresh league-scoped data through the app's refresh control or authenticated league routes.

## Verify

```bash
.venv/bin/python -m pipelines.ingestion.sync coverage-report --season 2026 --minimum-players 250 --maximum-snapshot-age-hours 2
```

Treat coverage failure or a nonzero exit as incomplete. Report partial provider failures separately; unmatched aliases do not invalidate successfully persisted players. Preserve the last valid snapshots and never delete rows to force freshness.

Report command status, coverage, freshness, source failures, and whether another run or code fix is required.

## GitHub Actions fallback

If local production credentials are unavailable, dispatch `Sync global player data` with `season=2026` and `include_sources=true`. League state is intentionally outside this workflow.

Do not claim freshness until the jobs finish and coverage verification passes.
