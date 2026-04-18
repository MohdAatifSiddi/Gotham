import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const supabase: SupabaseClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
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
async function checkLimit(ctx: AuthCtx) {
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
      const r = new Response(JSON.stringify({ error: "Rate limit exceeded", tier: ctx.tier, limit_per_hour: ctx.rateLimit, used: limit.used, retry_after_seconds: 3600 }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "X-RateLimit-Limit": String(ctx.rateLimit), "X-RateLimit-Remaining": "0", "Retry-After": "3600", "X-RateLimit-Tier": ctx.tier } });
      logUsage(ctx, endpoint, req.method, 429, Date.now() - start, params); return r;
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

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function distanceDecay(distKm: number, maxKm: number): number {
  if (distKm >= maxKm) return 0;
  return Math.exp(-3 * (distKm / maxKm));
}

interface RoutePoint { lat: number; lng: number; }

interface SegmentAnalysis {
  segment_index: number;
  from: RoutePoint;
  to: RoutePoint;
  distance_km: number;
  risk_score: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  hazards: { type: string; severity: number; distance_km: number; title: string }[];
  delay_minutes: number;
  recommendation: string;
}

// Interpolate points along a segment for finer analysis
function interpolateSegment(from: RoutePoint, to: RoutePoint, maxKmPerStep: number): RoutePoint[] {
  const dist = haversineKm(from.lat, from.lng, to.lat, to.lng);
  const steps = Math.max(1, Math.ceil(dist / maxKmPerStep));
  const points: RoutePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push({ lat: from.lat + t * (to.lat - from.lat), lng: from.lng + t * (to.lng - from.lng) });
  }
  return points;
}

Deno.serve(withMiddleware("route-risk", async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST required" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const route: RoutePoint[] = body.route;
  if (!Array.isArray(route) || route.length < 2) {
    return new Response(JSON.stringify({ error: "Route needs ≥2 points with lat/lng" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  for (const p of route) {
    if (typeof p.lat !== "number" || typeof p.lng !== "number" ||
      p.lat < -90 || p.lat > 90 || p.lng < -180 || p.lng > 180) {
      return new Response(JSON.stringify({ error: "Invalid coordinates in route" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  try {
    // Get bounding box for entire route + buffer
    const lats = route.map(p => p.lat);
    const lngs = route.map(p => p.lng);
    const buffer = 1.0; // ~111km buffer
    const { data: events } = await supabase
      .from("planetary_events")
      .select("*")
      .gte("latitude", Math.min(...lats) - buffer)
      .lte("latitude", Math.max(...lats) + buffer)
      .gte("longitude", Math.min(...lngs) - buffer)
      .lte("longitude", Math.max(...lngs) + buffer)
      .gte("event_time", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
      .order("event_time", { ascending: false })
      .limit(200);

    const allEvents = events || [];
    const segments: SegmentAnalysis[] = [];
    let totalDelay = 0;
    let maxSegScore = 0;
    const highRiskZones: { lat: number; lng: number; risk_score: number; hazard: string }[] = [];

    for (let i = 0; i < route.length - 1; i++) {
      const from = route[i];
      const to = route[i + 1];
      const segDist = haversineKm(from.lat, from.lng, to.lat, to.lng);

      // Sample points along segment every ~25km
      const samplePoints = interpolateSegment(from, to, 25);
      const EVAL_RADIUS = 75; // km

      let maxScore = 0;
      const segHazards: { type: string; severity: number; distance_km: number; title: string }[] = [];
      const seenEvents = new Set<string>();

      for (const pt of samplePoints) {
        for (const e of allEvents) {
          if (seenEvents.has(e.id)) continue;
          const dist = haversineKm(pt.lat, pt.lng, e.latitude, e.longitude);
          if (dist > EVAL_RADIUS) continue;

          const decay = distanceDecay(dist, EVAL_RADIUS);
          const score = decay * (e.severity || 0.5) * 100;
          if (score > maxScore) maxScore = score;

          seenEvents.add(e.id);
          segHazards.push({
            type: e.event_type,
            severity: Math.round(e.severity * 100) / 100,
            distance_km: Math.round(dist * 10) / 10,
            title: e.title,
          });

          if (score > 40) {
            highRiskZones.push({
              lat: e.latitude,
              lng: e.longitude,
              risk_score: Math.round(score),
              hazard: e.event_type,
            });
          }
        }
      }

      const segScore = Math.min(100, Math.round(maxScore));
      const risk_level: "LOW" | "MEDIUM" | "HIGH" =
        segScore >= 70 ? "HIGH" : segScore >= 30 ? "MEDIUM" : "LOW";

      // ETA delay heuristic
      const delay = segScore >= 70 ? Math.round(segDist * 0.3) : segScore >= 40 ? Math.round(segDist * 0.1) : 0;
      totalDelay += delay;

      const recommendation = segScore >= 70
        ? "Consider alternative route — high hazard zone"
        : segScore >= 40
        ? "Proceed with caution — moderate risk detected"
        : "Clear — no significant hazards";

      if (segScore > maxSegScore) maxSegScore = segScore;

      segments.push({
        segment_index: i,
        from,
        to,
        distance_km: Math.round(segDist * 10) / 10,
        risk_score: segScore,
        risk_level,
        hazards: segHazards.sort((a, b) => a.distance_km - b.distance_km).slice(0, 10),
        delay_minutes: delay,
        recommendation,
      });
    }

    const totalDist = segments.reduce((s, seg) => s + seg.distance_km, 0);
    const avgScore = Math.round(segments.reduce((s, seg) => s + seg.risk_score, 0) / segments.length);
    const overallLevel: "LOW" | "MEDIUM" | "HIGH" =
      maxSegScore >= 70 ? "HIGH" : avgScore >= 30 ? "MEDIUM" : "LOW";

    const shouldReroute = maxSegScore >= 60;

    return new Response(JSON.stringify({
      risk_score: avgScore,
      risk_level: overallLevel,
      total_distance_km: Math.round(totalDist * 10) / 10,
      segments,
      high_risk_zones: highRiskZones.slice(0, 20),
      delay_minutes: totalDelay,
      reroute_recommended: shouldReroute,
      recommendations: [
        ...(shouldReroute ? ["⚠️ Rerouting recommended — high-risk segments detected"] : []),
        ...(totalDelay > 0 ? [`Estimated ${totalDelay} min delay due to hazard zones`] : []),
        segments.length === segments.filter(s => s.risk_score < 30).length ? "✅ Route is clear — no significant hazards" : "",
      ].filter(Boolean),
      total_segments: segments.length,
      timestamp: new Date().toISOString(),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("Route risk error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}));
