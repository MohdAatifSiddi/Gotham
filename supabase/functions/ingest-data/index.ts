import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function earthquakeRisk(mag: number): { level: string; severity: number } {
  if (mag >= 7) return { level: "HIGH", severity: Math.min(mag / 10, 1) };
  if (mag >= 5) return { level: "HIGH", severity: mag / 10 };
  if (mag >= 3) return { level: "MEDIUM", severity: mag / 10 };
  return { level: "LOW", severity: mag / 10 };
}

async function ingestEarthquakes() {
  const res = await fetch(
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson"
  );
  if (!res.ok) return 0;
  const data = await res.json();

  const events = data.features.map((f: any) => {
    const { mag, place, time } = f.properties;
    const [lng, lat] = f.geometry.coordinates;
    const risk = earthquakeRisk(mag || 0);
    return {
      event_type: "earthquake",
      title: `M${mag} - ${place}`,
      description: `Magnitude ${mag} earthquake`,
      latitude: lat,
      longitude: lng,
      severity: risk.severity,
      risk_level: risk.level,
      source: "usgs",
      source_id: f.id,
      raw_data: f.properties,
      event_time: new Date(time).toISOString(),
    };
  });

  if (events.length > 0) {
    const { error } = await supabase
      .from("planetary_events")
      .upsert(events, { onConflict: "source,source_id" });
    if (error) console.error("Earthquake upsert error:", error);

    // Archive to event_history
    await supabase.from("event_history").upsert(
      events.map((e: any) => ({ ...e, archived_at: new Date().toISOString() })),
      { onConflict: "source,source_id" }
    ).then(({ error }) => { if (error) console.error("History archive eq error:", error); });
  }
  return events.length;
}

async function ingestWildfires() {
  const res = await fetch(
    "https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&status=open&limit=100"
  );
  if (!res.ok) return 0;
  const data = await res.json();

  const events = data.events.map((e: any) => {
    const geo = e.geometry?.[0];
    const coords = geo?.coordinates || [0, 0];
    return {
      event_type: "wildfire",
      title: e.title,
      description: `Source: ${e.sources?.[0]?.id || "NASA"}`,
      latitude: coords[1],
      longitude: coords[0],
      severity: 0.75,
      risk_level: "HIGH",
      source: "nasa_eonet",
      source_id: e.id,
      raw_data: e,
      event_time: new Date(geo?.date || Date.now()).toISOString(),
    };
  });

  if (events.length > 0) {
    const { error } = await supabase
      .from("planetary_events")
      .upsert(events, { onConflict: "source,source_id" });
    if (error) console.error("Wildfire upsert error:", error);

    await supabase.from("event_history").upsert(
      events.map((e: any) => ({ ...e, archived_at: new Date().toISOString() })),
      { onConflict: "source,source_id" }
    ).then(({ error }) => { if (error) console.error("History archive wf error:", error); });
  }
  return events.length;
}

async function ingestAirQuality() {
  const res = await fetch(
    "https://api.openaq.org/v2/measurements?limit=100&parameter=pm25&order_by=datetime&sort=desc",
    { headers: { Accept: "application/json" } }
  );
  if (!res.ok) return 0;
  const data = await res.json();

  const events = (data.results || [])
    .filter((m: any) => m.coordinates?.latitude && m.coordinates?.longitude)
    .map((m: any, i: number) => {
      const aqi = m.value || 0;
      let risk_level = "LOW";
      let severity = 0.1;
      if (aqi > 200) { risk_level = "HIGH"; severity = 0.9; }
      else if (aqi > 100) { risk_level = "MEDIUM"; severity = 0.6; }
      else if (aqi > 50) { risk_level = "MEDIUM"; severity = 0.4; }

      return {
        event_type: "air_quality",
        title: `AQ: ${m.location || "Station"} - PM2.5: ${aqi}`,
        description: `PM2.5: ${aqi} µg/m³ at ${m.location}`,
        latitude: m.coordinates.latitude,
        longitude: m.coordinates.longitude,
        severity,
        risk_level,
        source: "openaq",
        source_id: `openaq-${m.locationId}-${m.date?.utc || i}`,
        raw_data: m,
        event_time: new Date(m.date?.utc || Date.now()).toISOString(),
      };
    });

  if (events.length > 0) {
    const { error } = await supabase
      .from("planetary_events")
      .upsert(events, { onConflict: "source,source_id" });
    if (error) console.error("AirQuality upsert error:", error);

    await supabase.from("event_history").upsert(
      events.map((e: any) => ({ ...e, archived_at: new Date().toISOString() })),
      { onConflict: "source,source_id" }
    ).then(({ error }) => { if (error) console.error("History archive aq error:", error); });
  }
  return events.length;
}

// Clean up old risk cache entries
async function cleanupCache() {
  const { error } = await supabase
    .from("risk_cache")
    .delete()
    .lt("expires_at", new Date().toISOString());
  if (error) console.error("Cache cleanup error:", error);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const [eq, wf, aq] = await Promise.all([
      ingestEarthquakes(),
      ingestWildfires(),
      ingestAirQuality(),
    ]);

    // Cleanup expired cache
    await cleanupCache();

    return new Response(
      JSON.stringify({
        success: true,
        ingested: { earthquakes: eq, wildfires: wf, air_quality: aq },
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Ingestion error:", err);
    return new Response(
      JSON.stringify({ error: "Ingestion failed", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
