# Eval

| Command | What |
|---|---|
| `pnpm eval` | Golden set (`eval/golden`), Haiku 5.5 + Sonnet 5.5 fallback |
| `pnpm eval -- --enforce` | Same, exit 1 below the launch bar (CI / before merging pipeline changes) |
| `pnpm eval -- --dir eval/pii --enforce` | Synthetic invoices with seeded fake PII: must be 0 leaks |
| `pnpm eval -- --no-fallback` | Primary model only (measures how often fallback is needed) |
| `pnpm eval -- --only auto-01` | One case |
| `pnpm --filter @itqf/eval synth` | Regenerate `eval/pii/` |

Reports land in `eval/results/` (gitignored). See `golden/README.md` for labeling rules.
