import { servicesFor, CATEGORIES } from "@itqf/core";

// Phase 0 placeholder. Real screens come from the Claude Design pass (PRD §16) in Phase 1.
export function App() {
  return (
    <main className="mx-auto max-w-xl px-4 py-12 text-lg text-slate-900">
      <h1 className="text-4xl font-bold tracking-tight">Is this quote fair?</h1>
      <p className="mt-4 text-slate-700">
        Photograph a service quote and see how it compares with typical Wake County prices, line by line.
      </p>
      <p className="mt-8 text-sm text-slate-500">
        Coming soon · {CATEGORIES.length} categories · {servicesFor().length} services
      </p>
    </main>
  );
}
