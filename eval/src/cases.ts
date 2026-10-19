import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LabelSchema, type Label } from "./label.ts";

export interface GoldenCase {
  id: string;
  label: Label;
  /** Page files in order. `<id>.jpg`, or `<id>.p1.jpg`, `<id>.p2.jpg`, ... or `<id>.pdf`. */
  pages: string[];
}

const PAGE_RE = /^(?<id>.+?)(?:\.p(?<page>\d+))?\.(?<ext>jpe?g|png|webp|pdf)$/i;

export function loadCases(dir: string): { cases: GoldenCase[]; problems: string[] } {
  const files = readdirSync(dir);
  const pagesById = new Map<string, { page: number; file: string }[]>();
  for (const f of files) {
    const m = f.match(PAGE_RE);
    if (!m?.groups) continue;
    const id = m.groups.id!;
    pagesById.set(id, [...(pagesById.get(id) ?? []), { page: Number(m.groups.page ?? 1), file: join(dir, f) }]);
  }

  const problems: string[] = [];
  const cases: GoldenCase[] = [];
  for (const f of files.filter((f) => f.endsWith(".json")).sort()) {
    const id = f.slice(0, -".json".length);
    const pages = pagesById.get(id);
    pagesById.delete(id);
    if (!pages) {
      problems.push(`${f}: no image/PDF named ${id}.jpg|png|webp|pdf`);
      continue;
    }
    const parsed = LabelSchema.safeParse(JSON.parse(readFileSync(join(dir, f), "utf8")));
    if (!parsed.success) {
      problems.push(`${f}: ${parsed.error.message}`);
      continue;
    }
    if (pages.length > 5) problems.push(`${id}: ${pages.length} pages (upload limit is 5)`);
    cases.push({ id, label: parsed.data, pages: pages.sort((a, b) => a.page - b.page).map((p) => p.file) });
  }
  for (const id of pagesById.keys()) problems.push(`${id}: image without a ${id}.json label`);
  return { cases, problems };
}
