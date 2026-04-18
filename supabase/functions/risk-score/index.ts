// EARTH-OS Risk Score API
// Calibrated risk engine: distance × time × severity decay with multi-event aggregation.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const supabase: SupabaseClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ---------- Inline middleware: rate limiting + usage logging ----------
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
    await supabase.from("usage_logs").insert({
      api_key_id: ctx.apiKeyId, endpoint, method, status_code: status,
      response_time_ms: ms, ip_address: ctx.ip, request_params: params,
    });
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
      const r = new Response(JSON.stringify({ error: "Rate limit exceeded", tier: ctx.tier, limit_per_hour: ctx.rateLimit, used: limit.used, retry_after_seconds: 3600 }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "X-RateLimit-Limit": String(ctx.rateLimit), "X-RateLimit-Remaining": "0", "Retry-After": "3600", "X-RateLimit-Tier": ctx.tier },
      });
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
// ---------- end middleware ----------

const toGrid = (v: number) => Math.round(v * 10) / 10;

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const distanceDecay = (d: number, max: number) => d >= max ? 0 : Math.exp(-3 * (d / max));

const TIME_WINDOWS_H: Record<string, number> = { earthquake: 72, wildfire: 14 * 24, air_quality: 24 };

function timeDecay(eventTime: string, type: string): number {
  const maxH = TIME_WINDOWS_H[type] || 48;
  const ageH = (Date.now() - new Date(eventTime).getTime()) / 3600000;
  if (ageH >= maxH) return 0.05;
  const k = type === "wildfire" ? 1.5 : 2.3;
  return Math.exp(-k * (ageH / maxH));
}

function severityWeight(event: any): number {
  const type = event.event_type;
  const sev = event.severity || 0;
  const raw = event.raw_data || {};
  switch (type) {
    case "earthquake": {
      const mag = raw.mag || raw.properties?.mag || sev * 10;
      return Math.min(1, Math.pow(Math.max(0, mag) / 8, 2.0));
    }
    case "wildfire":
      return Math.min(1, 0.4 + sev * 0.7);
    case "air_quality": {
      const pm25 = raw.value || sev * 300;
      if (pm25 > 200) return 0.95;
      if (pm25 > 100) return 0.7;
      if (pm25 > 50) return 0.4;
      return 0.15;
    }
    default: return sev;
  }
}

interface ContributingFactor { type: string; weight: number; count: number; max_severity: number; nearest_km: number; }

async function computeRisk(lat: number, lng: number) {
  const latGrid = toGrid(lat), lngGrid = toGrid(lng);
  const { data: cached } = await supabase.from("risk_cache").select("*")
    .eq("lat_grid", latGrid).eq("lng_grid", lngGrid)
    .gt("expires_at", new Date().toISOString()).maybeSingle();
  if (cached) {
    return {
      risk_score: cached.risk_score,
      risk_level: cached.risk_level,
      contributing_factors: (cached.factors || []).map((f: string) => { try { return JSON.parse(f); } catch { return { type: f, weight: 0, count: 0, max_severity: 0, nearest_km: 0 }; } }),
      confidence: cached.confidence,
      timestamp: cached.created_at,
      recommendation: cached.recommendation,
      events_analyzed: 0,
      query_radius_km: 200,
      cached: true,
    };
  }

  const RADIUS_KM = 200;
  const radiusDeg = RADIUS_KM / 111;
  const { data: events } = await supabase.from("planetary_events").select("*")
    .gte("latitude", lat - radiusDeg).lte("latitude", lat + radiusDeg)
    .gte("longitude", lng - radiusDeg).lte("longitude", lng + radiusDeg)
    .gte("event_time", new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString())
    .order("event_time", { ascending: false }).limit(300);

  const factorMap = new Map<string, { totalWeight: number; count: number; maxSev: number; nearestKm: number }>();
  let aggregated = 0;
  for (const e of (events || [])) {
    const dist = haversineKm(lat, lng, e.latitude, e.longitude);
    if (dist > RADIUS_KM) continue;
    const w = distanceDecay(dist, RADIUS_KM) * timeDecay(e.event_time, e.event_type) * severityWeight(e);
    aggregated += w;
    const f = factorMap.get(e.event_type) || { totalWeight: 0, count: 0, maxSev: 0, nearestKm: Infinity };
    f.totalWeight += w; f.count += 1;
    f.maxSev = Math.max(f.maxSev, severityWeight(e));
    f.nearestKm = Math.min(f.nearestKm, dist);
    factorMap.set(e.event_type, f);
  }

  const score = Math.min(100, Math.round(100 * (1 - Math.exp(-2.5 * aggregated))));
  const risk_level = score >= 70 ? "HIGH" : score >= 30 ? "MEDIUM" : "LOW";
  const recommendation = score >= 85 ? "avoid" : score >= 70 ? "reroute" : score >= 50 ? "delay" : score >= 30 ? "caution" : "proceed";

  const eventCount = events?.length || 0;
  const confidence = eventCount === 0 ? 0.1 : Math.min(0.95, 0.3 + eventCount * 0.025 + (factorMap.size > 1 ? 0.15 : 0));

  const contributing_factors: ContributingFactor[] = [];
  for (const [type, f] of factorMap) {
    contributing_factors.push({
      type, weight: Math.round(f.totalWeight * 1000) / 1000,
      count: f.count, max_severity: Math.round(f.maxSev * 100) / 100,
      nearest_km: Math.round(f.nearestKm * 10) / 10,
    });
  }
  contributing_factors.sort((a, b) => b.weight - a.weight);

  const result = {
    risk_score: score, risk_level, contributing_factors,
    confidence: Math.round(confidence * 100) / 100,
    timestamp: new Date().toISOString(), recommendation,
    events_analyzed: eventCount, query_radius_km: RADIUS_KM, cached: false,
  };

  await supabase.from("risk_cache").upsert({
    lat_grid: latGrid, lng_grid: lngGrid, risk_score: score, risk_level,
    factors: contributing_factors.map(f => JSON.stringify(f)),
    confidence: result.confidence, recommendation,
    expires_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
  }, { onConflict: "lat_grid,lng_grid" });

  return result;
}

Deno.serve(withMiddleware("risk-score", async (req) => {
  const url = new URL(req.url);
  const lat = parseFloat(url.searchParams.get("latitude") || "");
  const lng = parseFloat(url.searchParams.get("longitude") || "");
  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return new Response(JSON.stringify({ error: "Valid latitude (-90 to 90) and longitude (-180 to 180) required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const result = await computeRisk(lat, lng);
  return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}));
