import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase: SupabaseClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const TIER_LIMITS: Record<string, number> = { free: 100, pro: 5000, enterprise: 100000 };
const ANON_LIMIT = 60;
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
interface AuthCtx { apiKeyId: string | null; tier: string; rateLimit: number; ip: string; }
async function resolveAuth(req: Request): Promise<AuthCtx> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || "unknown";
  const raw = req.headers.get("x-api-key");
  if (!raw) return { apiKeyId: null, tier: "anonymous", rateLimit: ANON_LIMIT, ip };
  const hash = await sha256Hex(raw);
  const { data } = await supabase.from("api_keys").select("id, tier, rate_limit, is_active").eq("key_hash", hash).eq("is_active", true).maybeSingle();
  if (!data) return { apiKeyId: null, tier: "anonymous", rateLimit: ANON_LIMIT, ip };
  return { apiKeyId: data.id, tier: data.tier || "free", rateLimit: data.rate_limit || TIER_LIMITS[data.tier || "free"], ip };
}
async function checkLimit(ctx: AuthCtx): Promise<{ allowed: boolean; used: number }> {
  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  let q = supabase.from("usage_logs").select("id", { count: "exact", head: true }).gte("created_at", since);
  q = ctx.apiKeyId ? q.eq("api_key_id", ctx.apiKeyId) : q.is("api_key_id", null).eq("ip_address", ctx.ip);
  const { count } = await q;
  return { allowed: (count || 0) < ctx.rateLimit, used: count || 0 };
}
async function logUsage(ctx: AuthCtx, endpoint: string, method: string, status: number, ms: number, params: Record<string, unknown> | null) {
  try {
    await supabase.from("usage_logs").insert({ api_key_id: ctx.apiKeyId, endpoint, method, status_code: status, response_time_ms: ms, ip_address: ctx.ip, request_params: params });
    if (ctx.apiKeyId) await supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", ctx.apiKeyId);
  } catch (e) { console.error("logUsage:", e); }
}
function withMiddleware(endpoint: string, handler: (req: Request, ctx: AuthCtx) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    const start = Date.now();
    const ctx = await resolveAuth(req);
    const params = Object.fromEntries(new URL(req.url).searchParams.entries());
    const limit = await checkLimit(ctx);
    if (!limit.allowed) {
      const r = new Response(JSON.stringify({ error: "Rate limit exceeded", tier: ctx.tier, limit_per_hour: ctx.rateLimit, used: limit.used, retry_after_seconds: 3600 }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "X-RateLimit-Limit": String(ctx.rateLimit), "X-RateLimit-Remaining": "0", "Retry-After": "3600", "X-RateLimit-Tier": ctx.tier } });
      logUsage(ctx, endpoint, req.method, 429, Date.now() - start, params);
      return r;
    }
    let response: Response;
    try { response = await handler(req, ctx); }
    catch (err) { console.error(`[${endpoint}]`, err); response = new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
    const h = new Headers(response.headers);
    for (const [k, v] of Object.entries(corsHeaders)) h.set(k, v);
    h.set("X-RateLimit-Limit", String(ctx.rateLimit));
    h.set("X-RateLimit-Remaining", String(Math.max(0, ctx.rateLimit - limit.used - 1)));
    h.set("X-RateLimit-Tier", ctx.tier);
    const wrapped = new Response(response.body, { status: response.status, headers: h });
    logUsage(ctx, endpoint, req.method, response.status, Date.now() - start, params);
    return wrapped;
  };
}

Deno.serve(withMiddleware("subscribe", async (req, ctx) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST required" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (!ctx.apiKeyId) {
    return new Response(JSON.stringify({ error: "Valid x-api-key header required for subscriptions" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const { latitude, longitude, radius_km, threshold, webhook_url, event_types } = body;
  if (typeof latitude !== "number" || typeof longitude !== "number" || !webhook_url) {
    return new Response(JSON.stringify({ error: "latitude, longitude, and webhook_url are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  try { new URL(webhook_url); } catch {
    return new Response(JSON.stringify({ error: "Invalid webhook_url" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const { data, error } = await supabase.from("alert_subscriptions").insert({
    api_key_id: ctx.apiKeyId, latitude, longitude,
    radius_km: radius_km || 100, threshold: threshold || 70, webhook_url,
    event_types: event_types || ["earthquake", "wildfire", "air_quality"],
  }).select().single();
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  return new Response(JSON.stringify({
    success: true, subscription_id: data.id,
    message: "Webhook subscription created. You will receive alerts when risk exceeds threshold.",
  }), { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}));
