# Web application

Next.js UI and backend-for-frontend for FF Copilot.

```bash
npm install
npm run dev
npm run typecheck
npm run build
```

Code is organized under `src/app`, `src/components`, `src/features`, and `src/lib`. Copilot routes delegate to `src/features/copilot/server`; browser adapters live under `src/features/copilot/client`; the framework-independent loop lives at `packages/agent-runtime`.
