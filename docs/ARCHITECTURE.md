# Architecture

## Runtime boundaries

### Web application (`apps/web`)

- `src/app`: Next.js routes only. API routes authenticate, validate, delegate, and serialize responses.
- `src/features/copilot/client`: browser transport, Supabase thread persistence adapter, fantasy tool executor, and React state.
- `src/features/copilot/server`: OpenAI-compatible provider boundary and daily league-context builder.
- `src/features/copilot/components`: Copilot UI.
- `src/components`: shared layout/UI and non-agent product features.
- `src/lib`: shared web infrastructure such as Supabase clients, factual API transport, and workspace scope.

The browser owns orchestration of the bounded agent loop. It cannot access the provider key. Each inference step calls the authenticated `/api/agent` backend-for-frontend route.

### Agent runtime (`packages/agent-runtime`)

The dependency-free loop knows only messages, tool calls, tool results, and injected callbacks. It does not import React, Next.js, Supabase, OpenAI, or fantasy-football code. This is the extension point for alternate harnesses without duplicating loop semantics.

### Factual API (`services/api`)

FastAPI validates Supabase JWTs and forwards the caller token to PostgREST. Row Level Security therefore remains the authorization boundary. The API contains factual player, league, team, roster, and sync-status interfaces; it does not perform inference or scrape providers.

### Ingestion (`pipelines/ingestion`)

Operator jobs use the Supabase service role. Global ingestion stores player facts, rankings, and raw source documents. League ingestion stores settings, standings, and historical roster snapshots. Runs are idempotent and preserve the last successful data when one provider fails.

### Database (`infra/supabase`)

Migrations are append-only and ordered. Shared factual tables are readable by authenticated users. User league/team selections, active scope, threads, messages, usage, and context snapshots are protected by RLS.

## Copilot request flow

```text
Browser message
  -> shared agent runtime
  -> POST /api/agent
  -> authenticate and persist event
  -> reuse or rebuild today's thread context
  -> OpenAI-compatible model provider
  -> persist assistant tool call or answer
  -> browser executes factual tool when requested
  -> repeat until final answer
```

Each thread is permanently scoped to one team and league. Its context snapshot contains league settings, standings, every team name, and every compact roster. The snapshot is byte-stable during a UTC day, rebuilt lazily on the next UTC day, and manually refreshable. Detailed player rankings/news remain progressively disclosed through tools.

## Daily refresh

- `sync-global.yml` runs at 08:17 UTC and ingests the 2026 player pool plus ESPN, FantasyPros, and Reddit raw documents.
- `sync-leagues.yml` runs at 10:47 UTC and refreshes every stored 2026 ESPN league, then processes newly linked leagues.
- Context snapshots rebuild from Supabase on the first thread request of a new UTC day. Manual context refresh rereads Supabase; it does not call upstream providers.

## Adding a feature

1. Put reusable orchestration primitives in `packages`.
2. Put web-specific feature code under `apps/web/src/features/<feature>`.
3. Keep route files thin; move business logic into the feature's `server` or `client` directory.
4. Add factual API endpoints to `services/api`, never directly to components.
5. Add provider acquisition to `pipelines/ingestion`, never to request handlers.
6. Add database changes as a new numbered migration under `infra/supabase/migrations`.
