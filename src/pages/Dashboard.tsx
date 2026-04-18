import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Crosshair, Route as RouteIcon, AlertTriangle, Activity, Flame, Wind } from "lucide-react";

interface ApiEvent {
  id: string;
  event_type: "earthquake" | "wildfire" | "air_quality";
  title: string;
  latitude: number;
  longitude: number;
  severity: number;
  risk_level: string;
  event_time: string;
  source: string;
}

interface RiskScore {
  risk_score: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH";
  contributing_factors: { type: string; weight: number; count: number; max_severity: number; nearest_km: number }[];
  confidence: number;
  recommendation: string;
  events_analyzed: number;
}

interface Prediction {
  current_risk_score: number;
  predictions: {
    horizon: string;
    hours: number;
    predicted_risk_score: number;
    predicted_risk_level: string;
    confidence: number;
    predicted_factors: { type: string; trend: string; reason: string; probability: number }[];
  }[];
}

interface RouteResult {
  risk_score: number;
  risk_level: string;
  total_distance_km: number;
  delay_minutes: number;
  reroute_recommended: boolean;
  segments: { segment_index: number; distance_km: number; risk_score: number; risk_level: string; recommendation: string; from: { lat: number; lng: number }; to: { lat: number; lng: number } }[];
  recommendations: string[];
}

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const FN_HEADERS = { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` };

const TYPE_COLOR: Record<string, string> = {
  earthquake: "#EF4444",
  wildfire: "#F97316",
  air_quality: "#A855F7",
};
const TYPE_ICON: Record<string, typeof Activity> = {
  earthquake: Activity,
  wildfire: Flame,
  air_quality: Wind,
};

function ClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

type Mode = "inspect" | "route";

export default function Dashboard() {
  const [events, setEvents] = useState<ApiEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("inspect");
  const [selectedPoint, setSelectedPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [risk, setRisk] = useState<RiskScore | null>(null);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);

  const [routePoints, setRoutePoints] = useState<{ lat: number; lng: number }[]>([]);
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);

  // Fetch events on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${FN_BASE}/events?limit=200`, { headers: FN_HEADERS });
        const json = await res.json();
        setEvents(json.events || []);
      } catch (e) {
        console.error("events fetch:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Realtime: subscribe to new events
  useEffect(() => {
    const channel = supabase
      .channel("dashboard-events")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "planetary_events" }, (payload) => {
        setEvents((prev) => [payload.new as ApiEvent, ...prev].slice(0, 300));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Fetch risk & prediction when point selected (inspect mode)
  useEffect(() => {
    if (!selectedPoint || mode !== "inspect") return;
    setRiskLoading(true);
    setRisk(null);
    setPrediction(null);
    const { lat, lng } = selectedPoint;
    Promise.all([
      fetch(`${FN_BASE}/risk-score?latitude=${lat}&longitude=${lng}`, { headers: FN_HEADERS }).then(r => r.json()),
      fetch(`${FN_BASE}/predict-risk?latitude=${lat}&longitude=${lng}`, { headers: FN_HEADERS }).then(r => r.json()),
    ])
      .then(([r, p]) => { setRisk(r); setPrediction(p); })
      .catch(e => console.error("risk fetch:", e))
      .finally(() => setRiskLoading(false));
  }, [selectedPoint, mode]);

  const handleMapClick = (lat: number, lng: number) => {
    if (mode === "inspect") {
      setSelectedPoint({ lat, lng });
    } else {
      setRoutePoints((prev) => [...prev, { lat, lng }]);
      setRouteResult(null);
    }
  };

  const computeRoute = async () => {
    if (routePoints.length < 2) return;
    setRouteLoading(true);
    try {
      const res = await fetch(`${FN_BASE}/route-risk`, {
        method: "POST",
        headers: { ...FN_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ route: routePoints }),
      });
      setRouteResult(await res.json());
    } catch (e) {
      console.error("route risk:", e);
    } finally {
      setRouteLoading(false);
    }
  };

  const clearRoute = () => { setRoutePoints([]); setRouteResult(null); };

  const eventCounts = useMemo(() => {
    const c = { earthquake: 0, wildfire: 0, air_quality: 0 };
    for (const e of events) c[e.event_type]++;
    return c;
  }, [events]);

  const riskColor = (level: string) =>
    level === "HIGH" ? "text-destructive" : level === "MEDIUM" ? "text-warning" : "text-success";
  const riskBg = (level: string) =>
    level === "HIGH" ? "bg-destructive/20 border-destructive/40" :
    level === "MEDIUM" ? "bg-warning/20 border-warning/40" :
    "bg-success/20 border-success/40";

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Top bar */}
      <header className="absolute left-0 right-0 top-0 z-[1000] flex items-center justify-between border-b border-border bg-background/80 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-4">
          <Link to="/" className="font-heading text-sm font-bold tracking-widest text-primary">
            Gotham
          </Link>
          <span className="font-mono text-[10px] uppercase text-muted-foreground">/ MISSION CONTROL</span>
        </div>
        <nav className="flex items-center gap-3 font-mono text-xs">
          <Link to="/" className="text-muted-foreground hover:text-foreground">Globe</Link>
          <Link to="/events" className="text-muted-foreground hover:text-foreground">Events</Link>
          <Link to="/docs" className="text-muted-foreground hover:text-foreground">API</Link>
          <span className="ml-2 flex items-center gap-1.5 rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-success">
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-success" />
            LIVE
          </span>
        </nav>
      </header>

      {/* Map */}
      <div className="absolute inset-0 pt-12">
        <MapContainer
          center={[20, 0]}
          zoom={2}
          minZoom={2}
          maxZoom={10}
          style={{ height: "100%", width: "100%", background: "hsl(var(--background))" }}
          worldCopyJump
          zoomControl={false}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          />
          <ClickHandler onClick={handleMapClick} />

          {events.map((e) => (
            <CircleMarker
              key={e.id}
              center={[e.latitude, e.longitude]}
              radius={3 + e.severity * 6}
              pathOptions={{
                color: TYPE_COLOR[e.event_type],
                fillColor: TYPE_COLOR[e.event_type],
                fillOpacity: 0.55,
                weight: 1,
              }}
            >
              <Popup>
                <div className="font-mono text-xs">
                  <div className="font-bold">{e.title}</div>
                  <div className="mt-1 text-muted-foreground">
                    {e.event_type.toUpperCase()} · sev {e.severity.toFixed(2)}
                  </div>
                  <div className="text-muted-foreground">
                    {new Date(e.event_time).toLocaleString()}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          ))}

          {selectedPoint && mode === "inspect" && (
            <CircleMarker
              center={[selectedPoint.lat, selectedPoint.lng]}
              radius={10}
              pathOptions={{ color: "hsl(217 91% 60%)", fillColor: "hsl(217 91% 60%)", fillOpacity: 0.3, weight: 2 }}
            />
          )}

          {mode === "route" && routePoints.length > 0 && (
            <>
              <Polyline
                positions={routePoints.map(p => [p.lat, p.lng] as [number, number])}
                pathOptions={{
                  color: routeResult ? (routeResult.risk_level === "HIGH" ? "#EF4444" : routeResult.risk_level === "MEDIUM" ? "#F59E0B" : "#22C55E") : "#3B82F6",
                  weight: 3,
                  dashArray: routeResult ? undefined : "6 6",
                }}
              />
              {routePoints.map((p, i) => (
                <CircleMarker
                  key={i}
                  center={[p.lat, p.lng]}
                  radius={6}
                  pathOptions={{ color: "#3B82F6", fillColor: i === 0 ? "#22C55E" : i === routePoints.length - 1 ? "#EF4444" : "#3B82F6", fillOpacity: 1, weight: 2 }}
                />
              ))}
            </>
          )}
        </MapContainer>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 z-[999] flex flex-col items-center justify-center bg-background/80">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">Loading planetary feed…</p>
        </div>
      )}

      {/* Left panel: stats + mode toggle */}
      <aside className="absolute bottom-4 left-4 top-16 z-[1000] flex w-72 flex-col gap-3 overflow-hidden">
        <div className="glass-panel rounded-lg p-3">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Live Feed</div>
          <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-xs">
            <Stat icon={Activity} label="QUAKE" value={eventCounts.earthquake} color="text-destructive" />
            <Stat icon={Flame} label="FIRE" value={eventCounts.wildfire} color="text-wildfire" />
            <Stat icon={Wind} label="AQI" value={eventCounts.air_quality} color="text-airquality" />
          </div>
        </div>

        <div className="glass-panel rounded-lg p-3">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Mode</div>
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={() => { setMode("inspect"); }}
              className={`flex items-center justify-center gap-1.5 rounded px-2 py-2 font-mono text-[11px] uppercase transition ${mode === "inspect" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
            >
              <Crosshair className="h-3 w-3" /> Inspect
            </button>
            <button
              onClick={() => { setMode("route"); setSelectedPoint(null); }}
              className={`flex items-center justify-center gap-1.5 rounded px-2 py-2 font-mono text-[11px] uppercase transition ${mode === "route" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}
            >
              <RouteIcon className="h-3 w-3" /> Route
            </button>
          </div>
          <div className="mt-2 font-mono text-[10px] text-muted-foreground">
            {mode === "inspect"
              ? "Click anywhere on the map to inspect risk."
              : `Click waypoints (${routePoints.length}/2+). ${routePoints.length >= 2 ? "Then compute." : ""}`}
          </div>
          {mode === "route" && (
            <div className="mt-2 flex gap-1">
              <button
                onClick={computeRoute}
                disabled={routePoints.length < 2 || routeLoading}
                className="flex-1 rounded bg-primary px-2 py-1.5 font-mono text-[11px] uppercase text-primary-foreground disabled:opacity-40"
              >
                {routeLoading ? "…" : "Analyze"}
              </button>
              <button
                onClick={clearRoute}
                className="rounded bg-secondary px-2 py-1.5 font-mono text-[11px] uppercase text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="glass-panel rounded-lg p-3 font-mono text-[10px]">
          <div className="mb-2 uppercase tracking-widest text-muted-foreground">Legend</div>
          <div className="space-y-1">
            <LegendDot color={TYPE_COLOR.earthquake} label="Earthquake" />
            <LegendDot color={TYPE_COLOR.wildfire} label="Wildfire" />
            <LegendDot color={TYPE_COLOR.air_quality} label="Air Quality" />
          </div>
        </div>
      </aside>

      {/* Right panel: inspection or route results */}
      {(selectedPoint || routeResult) && (
        <aside className="absolute bottom-4 right-4 top-16 z-[1000] flex w-80 flex-col gap-3 overflow-y-auto">
          {mode === "inspect" && selectedPoint && (
            <>
              <div className="glass-panel rounded-lg p-4">
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Inspect Point</div>
                <div className="mt-1 font-mono text-xs">
                  {selectedPoint.lat.toFixed(3)}°, {selectedPoint.lng.toFixed(3)}°
                </div>

                {riskLoading && (
                  <div className="mt-3 flex items-center gap-2 font-mono text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Computing risk…
                  </div>
                )}

                {risk && !riskLoading && (
                  <div className="mt-3">
                    <div className={`flex items-center justify-between rounded border px-3 py-2 ${riskBg(risk.risk_level)}`}>
                      <div>
                        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Current Risk</div>
                        <div className={`font-heading text-3xl font-bold ${riskColor(risk.risk_level)}`}>
                          {risk.risk_score}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-mono text-xs font-bold ${riskColor(risk.risk_level)}`}>{risk.risk_level}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">conf {(risk.confidence * 100).toFixed(0)}%</div>
                      </div>
                    </div>
                    <div className="mt-2 font-mono text-[11px]">
                      <span className="text-muted-foreground">Recommend: </span>
                      <span className="uppercase">{risk.recommendation}</span>
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {risk.events_analyzed} events in {200}km
                    </div>

                    {risk.contributing_factors.length > 0 && (
                      <div className="mt-3">
                        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Factors</div>
                        <div className="mt-1 space-y-1">
                          {risk.contributing_factors.map((f) => (
                            <div key={f.type} className="flex items-center justify-between rounded bg-secondary/50 px-2 py-1 font-mono text-[11px]">
                              <span style={{ color: TYPE_COLOR[f.type] }}>{f.type}</span>
                              <span className="text-muted-foreground">{f.count}× · {f.nearest_km}km</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {prediction && !riskLoading && (
                <div className="glass-panel rounded-lg p-4">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Predicted Risk</div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {prediction.predictions.map((p) => (
                      <div key={p.horizon} className={`rounded border px-2 py-2 ${riskBg(p.predicted_risk_level)}`}>
                        <div className="font-mono text-[10px] uppercase text-muted-foreground">+{p.horizon}</div>
                        <div className={`font-heading text-2xl font-bold ${riskColor(p.predicted_risk_level)}`}>
                          {p.predicted_risk_score}
                        </div>
                        <div className="font-mono text-[9px] text-muted-foreground">conf {(p.confidence * 100).toFixed(0)}%</div>
                      </div>
                    ))}
                  </div>
                  {prediction.predictions[1]?.predicted_factors.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {prediction.predictions[1].predicted_factors.map((f, i) => (
                        <div key={i} className="rounded bg-secondary/50 px-2 py-1.5 font-mono text-[10px] leading-relaxed">
                          <span style={{ color: TYPE_COLOR[f.type] }} className="font-bold">{f.type}</span>
                          <span className="ml-1 text-muted-foreground">· {f.trend}</span>
                          <div className="text-muted-foreground">{f.reason}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {mode === "route" && routeResult && (
            <div className="glass-panel rounded-lg p-4">
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Route Analysis</div>
              <div className={`mt-2 flex items-center justify-between rounded border px-3 py-2 ${riskBg(routeResult.risk_level)}`}>
                <div>
                  <div className="font-mono text-[10px] uppercase text-muted-foreground">Overall</div>
                  <div className={`font-heading text-3xl font-bold ${riskColor(routeResult.risk_level)}`}>
                    {routeResult.risk_score}
                  </div>
                </div>
                <div className="text-right font-mono text-[11px]">
                  <div className={`font-bold ${riskColor(routeResult.risk_level)}`}>{routeResult.risk_level}</div>
                  <div className="text-muted-foreground">{routeResult.total_distance_km} km</div>
                  {routeResult.delay_minutes > 0 && (
                    <div className="text-warning">+{routeResult.delay_minutes}min delay</div>
                  )}
                </div>
              </div>

              {routeResult.reroute_recommended && (
                <div className="mt-2 flex items-center gap-2 rounded border border-destructive/40 bg-destructive/10 px-2 py-1.5 font-mono text-[11px] text-destructive">
                  <AlertTriangle className="h-3 w-3" /> Reroute recommended
                </div>
              )}

              <div className="mt-3 space-y-1">
                {routeResult.segments.map((s) => (
                  <div key={s.segment_index} className="flex items-center justify-between rounded bg-secondary/50 px-2 py-1.5 font-mono text-[10px]">
                    <span className="text-muted-foreground">SEG {s.segment_index + 1} · {s.distance_km}km</span>
                    <span className={riskColor(s.risk_level)}>{s.risk_score}</span>
                  </div>
                ))}
              </div>

              {routeResult.recommendations.length > 0 && (
                <div className="mt-3 space-y-1">
                  {routeResult.recommendations.map((r, i) => (
                    <div key={i} className="font-mono text-[10px] text-muted-foreground">{r}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, color }: { icon: typeof Activity; label: string; value: number; color: string }) {
  return (
    <div className="rounded bg-secondary/50 px-2 py-1.5">
      <div className="flex items-center gap-1 text-[9px] uppercase text-muted-foreground">
        <Icon className={`h-3 w-3 ${color}`} /> {label}
      </div>
      <div className={`mt-0.5 font-heading text-base font-bold ${color}`}>{value}</div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}
