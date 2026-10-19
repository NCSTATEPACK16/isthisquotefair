/**
 * Golden-set extraction eval (PRD §11 quality bar).
 *
 *   pnpm eval                       # all cases, Haiku 5.5 with Sonnet 5.5 fallback
 *   pnpm eval -- --only auto-01     # one case
 *   pnpm eval -- --no-fallback      # primary model only
 *   pnpm eval -- --model claude-sonnet-5-5
 *   pnpm eval -- --enforce          # exit 1 below the launch bar (use in CI before merging pipeline changes)
 *
 * Needs ANTHROPIC_API_KEY. Writes a full report to eval/results/<timestamp>.json (gitignored).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { extractInvoice, type ContentPart, type ExtractResult } from "@itqf/core";
import { ClaudeProvider } from "@itqf/core/providers/claude";
import { loadCases, type GoldenCase } from "./cases.ts";
import { LAUNCH_THRESHOLDS, scoreCase, summarize, type CaseScore } from "./score.ts";

const here = new URL("..", import.meta.url).pathname;
const { values: args } = parseArgs({
  // `pnpm eval -- --flag` forwards the literal "--".
  args: process.argv.slice(2).filter((a) => a !== "--"),
  options: {
    only: { type: "string" },
    model: { type: "string", default: process.env.EXTRACT_MODEL ?? "claude-haiku-5-5" },
    "fallback-model": { type: "string", default: process.env.EXTRACT_FALLBACK_MODEL ?? "claude-sonnet-5-5" },
    "no-fallback": { type: "boolean", default: false },
    concurrency: { type: "string", default: "4" },
    enforce: { type: "boolean", default: false },
    dir: { type: "string", default: join(here, "golden") },
  },
});

/** Same normalization the web client will do before upload: ≤ 2000px long edge, JPEG q85. */
async function toContent(file: string): Promise<ContentPart> {
  if (extname(file).toLowerCase() === ".pdf") return { type: "pdf", base64: readFileSync(file).toString("base64") };
  const buf = await sharp(file).rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  return { type: "image", mediaType: "image/jpeg", base64: buf.toString("base64") };
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

async function main() {
  // pnpm runs this from eval/; resolve --dir against where the user typed the command.
  const dir = resolve(process.env.INIT_CWD ?? process.cwd(), args.dir!);
  const { cases: all, problems } = loadCases(dir);
  for (const p of problems) console.warn(`⚠ ${p}`);
  const cases = args.only ? all.filter((c) => c.id === args.only) : all;
  if (cases.length === 0) {
    console.error(`No golden cases found in ${dir}. See eval/golden/README.md.`);
    process.exit(args.enforce ? 1 : 0);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set.");
    process.exit(1);
  }

  const llm = new ClaudeProvider();
  const config = { model: args.model!, ...(args["no-fallback"] ? {} : { fallbackModel: args["fallback-model"]! }) };
  console.log(`Running ${cases.length} case(s) · model=${config.model} fallback=${config.fallbackModel ?? "off"}\n`);

  type Row = { c: GoldenCase; result?: ExtractResult; score?: CaseScore; error?: string };
  const rows: Row[] = await pool(cases, Number(args.concurrency), async (c): Promise<Row> => {
    try {
      const pages = await Promise.all(c.pages.map(toContent));
      const result = await extractInvoice(llm, pages, config, { category: c.label.category });
      return { c, result, score: scoreCase(c.id, c.label, result.extraction, result.vendorNameTransient) };
    } catch (err) {
      return { c, error: err instanceof Error ? err.message : String(err) };
    }
  });

  for (const r of rows) {
    if (r.error || !r.score || !r.result) {
      console.log(`✗ ${r.c.id.padEnd(16)} ERROR ${r.error}`);
      continue;
    }
    const s = r.score;
    const cost = r.result.attempts.reduce((a, x) => a + (x.usage?.costUsd ?? 0), 0);
    const ok = s.correct === Math.max(s.labelCount, s.predictedCount) && s.totalReconciled && s.piiLeaks.length === 0;
    console.log(
      `${ok ? "✓" : "✗"} ${s.id.padEnd(16)} lines ${s.correct}/${Math.max(s.labelCount, s.predictedCount)}` +
        `  total ${s.totalMatches ? "ok" : "MISMATCH"}  reconciles ${s.internallyReconciles ? "yes" : "NO"}` +
        `  pii ${s.piiLeaks.length}  ${r.result.usedFallback ? "fallback " : ""}$${cost.toFixed(4)}`,
    );
    if (!ok) {
      for (const m of s.matches.filter((m) => !m.keyOk)) {
        console.log(
          `    - "${m.label.description}" $${m.label.line_total} ${m.label.taxonomy_key} → ` +
            (m.predicted ? `got key ${m.predicted.taxonomy_key}` : "no line with that amount"),
        );
      }
      for (const e of s.extraPredicted) console.log(`    + extra: "${e.description}" $${e.line_total}`);
      for (const leak of s.piiLeaks) console.log(`    ! ${leak}`);
    }
  }

  const scores = rows.flatMap((r) => (r.score ? [r.score] : []));
  const summary = summarize(scores, rows.filter((r) => !r.score).length);
  const attempts = rows.flatMap((r) => r.result?.attempts ?? []);
  const cost = attempts.reduce((a, x) => a + (x.usage?.costUsd ?? 0), 0);
  const latencies = rows.flatMap((r) => (r.result ? [r.result.attempts.reduce((a, x) => a + x.latencyMs, 0)] : [])).sort((a, b) => a - b);
  const p90 = latencies[Math.max(0, Math.ceil(latencies.length * 0.9) - 1)] ?? 0;

  console.log(`
Line-item accuracy   ${pct(summary.lineItemAccuracy)}  (bar ${pct(LAUNCH_THRESHOLDS.lineItemAccuracy)})
  amounts found      ${pct(summary.amountAccuracy)}
  key right | amount ${pct(summary.keyAccuracyOnMatched)}
Total reconciliation ${pct(summary.totalReconciliation)}  (bar ${pct(LAUNCH_THRESHOLDS.totalReconciliation)})
PII leaks            ${summary.piiLeaks}  (bar 0)
Errored cases        ${summary.failedCases}
Fallbacks            ${rows.filter((r) => r.result?.usedFallback).length}/${rows.length}
Cost                 $${cost.toFixed(4)} total, $${(cost / rows.length).toFixed(4)}/case
Extract latency p90  ${(p90 / 1000).toFixed(1)}s
${summary.passes ? "PASS" : "FAIL"} launch bar`);

  mkdirSync(join(here, "results"), { recursive: true });
  const out = join(here, "results", `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  // vendorNameTransient is deliberately left out of the saved report.
  writeFileSync(
    out,
    JSON.stringify(
      { config, summary, cost, p90LatencyMs: p90, cases: rows.map((r) => ({ id: r.c.id, error: r.error, attempts: r.result?.attempts, score: r.score })) },
      null,
      2,
    ),
  );
  console.log(`\nReport: ${out}`);
  if (args.enforce && !summary.passes) process.exit(1);
}

await main();
