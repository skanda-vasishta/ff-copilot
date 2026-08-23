# FF Copilot

An authenticated fantasy-football workspace and in-season assistant grounded in ESPN, FantasyPros, and Reddit data.

## Repository map

| Path | Responsibility |
| --- | --- |
| `apps/web` | Next.js UI, authentication, and thin server routes |
| `services/api` | Authenticated FastAPI factual API (`/v1`) |
| `packages/agent-runtime` | Provider-independent TypeScript agent loop and message types |
| `pipelines/ingestion` | Idempotent ESPN/FantasyPros/Reddit ingestion CLI |
| `infra/supabase` | Postgres schema, migrations, indexes, and RLS |
| `.github/workflows` | Daily and operator-triggered ingestion jobs |
| `archive/legacy-2025` | Read-only CSV/notebook rollback material; never used at runtime |
| `archive/experiments` | Out-of-scope prototypes, including the old live-draft bridge |
| `docs` | Architecture and development guides |

Production storage is Supabase Postgres. **S3 is not used.**

## Local development

```bash
python -m pip install -r services/api/requirements.txt -r pipelines/ingestion/requirements.txt
uvicorn services.api.main:app --reload

cd apps/web
npm install
npm run dev
```

Environment templates are at `.env.example` for Python services and `apps/web/.env.example` for Next.js. Real environment files are ignored.

## Common commands

```bash
# Web
npm --prefix apps/web run typecheck
npm --prefix apps/web run build

# Python tests
python -m pytest services/api/test_main.py pipelines/ingestion/test_sync.py -q

# Current global facts and raw source documents
python -m pipelines.ingestion.sync sync-global --season 2026 --league-id ESPN_LEAGUE_ID --sources

# All stored ESPN leagues
python -m pipelines.ingestion.sync sync-league --season 2026 --all-linked
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for request flows, ownership boundaries, and extension points.
