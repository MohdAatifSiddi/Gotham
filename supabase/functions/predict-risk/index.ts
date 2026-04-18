import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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

interface PredictionResult {
  current_risk_score: number;
  predictions: {
    horizon: string;
    hours: number;
    predicted_risk_score: number;
    predicted_risk_level: string;
    confidence: number;
    predicted_factors: PredictedFactor[];
  }[];
  timestamp: string;
}

interface PredictedFactor {
  type: string;
  trend: "increasing" | "decreasing" | "stable";
  reason: string;
  probability: number;
}

Deno.serve(withMiddleware("predict-risk", async (req) => {
  const url = new URL(req.url);
  const lat = parseFloat(url.searchParams.get("latitude") || "");
  const lng = parseFloat(url.searchParams.get("longitude") || "");

  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return new Response(
      JSON.stringify({ error: "Valid latitude and longitude required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const RADIUS_KM = 200;
    const radiusDeg = RADIUS_KM / 111;

    // Get events from last 48h for trend analysis
    const { data: events } = await supabase
      .from("planetary_events")
      .select("*")
      .gte("latitude", lat - radiusDeg)
      .lte("latitude", lat + radiusDeg)
      .gte("longitude", lng - radiusDeg)
      .lte("longitude", lng + radiusDeg)
      .gte("event_time", new Date(Date.now() - 48 * 3600 * 1000).toISOString())
      .order("event_time", { ascending: true })
      .limit(200);

    // Get current risk score
    const riskRes = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/risk-score?latitude=${lat}&longitude=${lng}`,
      { headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` } }
    );
    const currentRisk = await riskRes.json();

    // Analyze trends by type
    const typeEvents = new Map<string, any[]>();
    for (const e of (events || [])) {
      const list = typeEvents.get(e.event_type) || [];
      list.push(e);
      typeEvents.set(e.event_type, list);
    }

    // Build predictions for 6h and 24h horizons
    const horizons = [
      { label: "6h", hours: 6 },
      { label: "24h", hours: 24 },
    ];

    const predictions = horizons.map(({ label, hours }) => {
      const predictedFactors: PredictedFactor[] = [];
      let riskDelta = 0;

      // Earthquake aftershock heuristic
      const quakes = typeEvents.get("earthquake") || [];
      if (quakes.length > 0) {
        const maxMag = Math.max(...quakes.map((q: any) => q.raw_data?.mag || q.severity * 10));
        const recentCount = quakes.filter((q: any) =>
          Date.now() - new Date(q.event_time).getTime() < 6 * 3600 * 1000
        ).length;

        // Bath's law: largest aftershock ~1.2 less than mainshock
        // Omori's law: aftershock rate decays as 1/(t+c)
        const aftershockProb = maxMag >= 5
          ? Math.min(0.9, 0.3 + (maxMag - 5) * 0.15 + recentCount * 0.02)
          : 0.1;

        const trend = recentCount > 3 ? "increasing" : "stable";
        predictedFactors.push({
          type: "earthquake",
          trend,
          reason: maxMag >= 5
            ? `M${maxMag.toFixed(1)} mainshock detected — aftershock probability elevated (Omori decay model)`
            : `Minor seismic activity (${quakes.length} events)`,
          probability: aftershockProb,
        });
        riskDelta += aftershockProb * (trend === "increasing" ? 15 : 5);
      }

      // Wildfire spread estimation
      const fires = typeEvents.get("wildfire") || [];
      if (fires.length > 0) {
        // Sort by time, check if fires are getting closer
        const dists = fires.map((f: any) => ({
          dist: haversineKm(lat, lng, f.latitude, f.longitude),
          time: new Date(f.event_time).getTime(),
        })).sort((a, b) => a.time - b.time);

        let trend: "increasing" | "decreasing" | "stable" = "stable";
        let spreadRate = 0;

        if (dists.length >= 2) {
          const first = dists[0];
          const last = dists[dists.length - 1];
          const timeDiffH = (last.time - first.time) / 3600000;
          if (timeDiffH > 0) {
            spreadRate = (first.dist - last.dist) / timeDiffH; // km/h approaching
            trend = spreadRate > 0.5 ? "increasing" : spreadRate < -0.5 ? "decreasing" : "stable";
          }
        }

        const nearestKm = Math.min(...dists.map(d => d.dist));
        // Predict: will fire reach within radius in `hours`?
        const predictedDist = Math.max(0, nearestKm - spreadRate * hours);
        const probability = predictedDist < 50 ? Math.min(0.85, 0.4 + (50 - predictedDist) / 100) : 0.15;

        predictedFactors.push({
          type: "wildfire",
          trend,
          reason: trend === "increasing"
            ? `Active wildfire ${nearestKm.toFixed(0)}km away, approaching at ~${spreadRate.toFixed(1)}km/h`
            : `${fires.length} active wildfire(s) detected, nearest ${nearestKm.toFixed(0)}km`,
          probability,
        });
        riskDelta += probability * (trend === "increasing" ? 20 : 8);
      }

      // AQI trend analysis
      const aqEvents = typeEvents.get("air_quality") || [];
      if (aqEvents.length > 0) {
        const values = aqEvents.map((a: any) => ({
          val: a.raw_data?.value || a.severity * 300,
          time: new Date(a.event_time).getTime(),
        })).sort((a, b) => a.time - b.time);

        let trend: "increasing" | "decreasing" | "stable" = "stable";
        if (values.length >= 2) {
          const firstHalf = values.slice(0, Math.floor(values.length / 2));
          const secondHalf = values.slice(Math.floor(values.length / 2));
          const avgFirst = firstHalf.reduce((s, v) => s + v.val, 0) / firstHalf.length;
          const avgSecond = secondHalf.reduce((s, v) => s + v.val, 0) / secondHalf.length;
          trend = avgSecond > avgFirst * 1.15 ? "increasing" : avgSecond < avgFirst * 0.85 ? "decreasing" : "stable";
        }

        const latestVal = values[values.length - 1]?.val || 0;
        const probability = latestVal > 100 ? 0.7 : latestVal > 50 ? 0.4 : 0.2;

        predictedFactors.push({
          type: "air_quality",
          trend,
          reason: `PM2.5 ${trend === "increasing" ? "rising" : trend === "decreasing" ? "improving" : "stable"} — latest reading ${latestVal.toFixed(0)} µg/m³`,
          probability,
        });
        riskDelta += (trend === "increasing" ? 10 : trend === "decreasing" ? -5 : 2);
      }

      // Time horizon discount: 24h predictions less certain
      const horizonDiscount = hours <= 6 ? 1.0 : 0.7;
      const baseScore = currentRisk.risk_score || 0;
      const predicted = Math.max(0, Math.min(100, Math.round(baseScore + riskDelta * horizonDiscount)));

      const confidence = predictedFactors.length === 0
        ? 0.1
        : Math.min(0.85, 0.2 + predictedFactors.length * 0.1 + (events?.length || 0) * 0.01) * horizonDiscount;

      return {
        horizon: label,
        hours,
        predicted_risk_score: predicted,
        predicted_risk_level: predicted >= 70 ? "HIGH" : predicted >= 30 ? "MEDIUM" : "LOW",
        confidence: Math.round(confidence * 100) / 100,
        predicted_factors: predictedFactors,
      };
    });

    const result: PredictionResult = {
      current_risk_score: currentRisk.risk_score || 0,
      predictions,
      timestamp: new Date().toISOString(),
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Predict risk error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}));
