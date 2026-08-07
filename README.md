# FF Copilot

FF Copilot is an authenticated fantasy-football data workspace. Supabase owns factual player, source, league, team, and roster data; FastAPI exposes stable tool-ready APIs; Next.js provides the product UI. AI is intentionally not part of ingestion or request handling yet.

## Architecture

- `supabase/migrations`: schema, indexes, ranking view, and Row Level Security.
- `ingestion`: operator CLI for legacy import, global ESPN/source ingestion, and public ESPN league sync.
- `api`: authenticated FastAPI `/v1` data API. It forwards the caller token to Supabase so RLS applies.
- `ff-copilot-frontend`: Supabase Auth, protected Next.js shell, player directory, and league manager.
- `.github/workflows`: manually dispatched global and league sync jobs, designed to accept a cron trigger later.

Legacy CSVs remain under `data/` only as rollback/import inputs. They are not used by the running app.

## Bootstrap Supabase

1. Create a Supabase project and run `supabase/migrations/0001_foundation.sql` in the SQL editor.
2. In Authentication, enable Email and any desired OAuth provider. Add local and production callback URLs ending in `/auth/callback`.
3. Copy `.env.example` to `.env` and `ff-copilot-frontend/.env.example` to `ff-copilot-frontend/.env.local`.
4. Configure the same values in Vercel. The service-role key belongs only in backend/operator environments and must never use a `NEXT_PUBLIC_` name.
5. Add GitHub Actions secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ESPN_SEED_LEAGUE_ID`, and optionally `REDDIT_CLIENT`/`REDDIT_SECRET`.

## Local development

```bash
python -m pip install -r api/requirements.txt -r ingestion/requirements.txt
uvicorn api.main:app --reload

cd ff-copilot-frontend
npm install
npm run dev
```

## Ingestion

Import the useful factual fields and raw source text from the retained 2025 CSVs. The importer ignores the old AI `sentiment` column:

```bash
python -m ingestion.sync import-legacy --season 2025
```

Build current data from a public ESPN league player pool:

```bash
python -m ingestion.sync sync-global --season 2026 --league-id ESPN_LEAGUE_ID
```

Add `--sources` to fetch ESPN, FantasyPros, and Reddit documents. Source failures make the run `partial` and preserve prior successful documents.

Sync one league or process user-created pending requests:

```bash
python -m ingestion.sync sync-league --season 2026 --league-id ESPN_LEAGUE_ID
python -m ingestion.sync sync-league --season 2026 --pending
```

## Verification

```bash
python -m pytest api/test_main.py ingestion/test_sync.py -q
cd ff-copilot-frontend && npm run typecheck && npm run build
```
