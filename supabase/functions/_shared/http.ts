export const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/** Phase 0 placeholder: every pipeline function exists so routing/deploys can be wired, but returns 501. */
export function notImplemented(name: string, phase: string): (req: Request) => Response {
  return (req) => (req.method === "OPTIONS" ? new Response("ok", { headers: corsHeaders }) : json({ error: "not_implemented", function: name, phase }, 501));
}
