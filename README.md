# IsThisQuoteFair (working name)

Photograph a service quote, see whether it's below, within or above the typical Wake County range,
line by line. Spec: [`docs/PRD.md`](docs/PRD.md). Working rules for contributors and Claude Code:
[`CLAUDE.md`](CLAUDE.md).

```bash
pnpm install
pnpm test && pnpm typecheck
pnpm db:test     # migrations + RLS against a throwaway Postgres
pnpm dev         # web app at http://localhost:5173
cp .env.example .env && pnpm eval   # extraction eval (needs ANTHROPIC_API_KEY + eval/golden/*)
```

Status: **Phase 0 (foundations)**. See `docs/phase0.md`.
