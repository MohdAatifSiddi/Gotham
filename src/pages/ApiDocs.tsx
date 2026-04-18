import { NavLink } from '@/components/NavLink';

const API_BASE = `https://emauifxsuaunuvrhvyry.supabase.co/functions/v1`;

const endpoints = [
  {
    method: 'GET',
    path: '/v1/risk-score',
    fn: 'risk-score',
    description: 'Advanced risk scoring with distance decay, time decay, severity weighting, and multi-event aggregation. Returns a 0-100 score with contributing factors, confidence, and actionable recommendation.',
    params: [
      { name: 'latitude', type: 'number', required: true, desc: 'Latitude (-90 to 90)' },
      { name: 'longitude', type: 'number', required: true, desc: 'Longitude (-180 to 180)' },
    ],
    example: {
      request: `curl "${API_BASE}/risk-score?latitude=34.05&longitude=-118.24"`,
      response: `{
  "risk_score": 42,
  "risk_level": "MEDIUM",
  "contributing_factors": [
    {
      "type": "earthquake",
      "weight": 0.312,
      "count": 5,
      "max_severity": 0.52,
      "nearest_km": 23.4
    }
  ],
  "confidence": 0.65,
  "recommendation": "delay",
  "events_analyzed": 8,
  "query_radius_km": 150,
  "timestamp": "2026-04-15T10:00:00Z"
}`,
    },
  },
  {
    method: 'GET',
    path: '/v1/predict-risk',
    fn: 'predict-risk',
    description: 'Predictive risk intelligence using earthquake aftershock heuristics (Omori decay), wildfire spread estimation, and AQI trend analysis. Returns forecasts for 6h and 24h horizons.',
    params: [
      { name: 'latitude', type: 'number', required: true, desc: 'Latitude (-90 to 90)' },
      { name: 'longitude', type: 'number', required: true, desc: 'Longitude (-180 to 180)' },
    ],
    example: {
      request: `curl "${API_BASE}/predict-risk?latitude=35.68&longitude=139.76"`,
      response: `{
  "current_risk_score": 35,
  "predictions": [
    {
      "horizon": "6h",
      "hours": 6,
      "predicted_risk_score": 48,
      "predicted_risk_level": "MEDIUM",
      "confidence": 0.62,
      "predicted_factors": [
        {
          "type": "earthquake",
          "trend": "increasing",
          "reason": "M5.2 mainshock detected — aftershock probability elevated",
          "probability": 0.65
        }
      ]
    },
    {
      "horizon": "24h",
      "hours": 24,
      "predicted_risk_score": 41,
      "predicted_risk_level": "MEDIUM",
      "confidence": 0.43,
      "predicted_factors": [...]
    }
  ],
  "timestamp": "2026-04-15T10:00:00Z"
}`,
    },
  },
  {
    method: 'POST',
    path: '/v1/route-risk',
    fn: 'route-risk',
    description: 'Route intelligence engine with segment-level analysis, high-risk zone detection, ETA delay estimation, and rerouting recommendations. Samples every ~25km along the route.',
    params: [
      { name: 'route', type: 'array', required: true, desc: 'Array of {lat, lng} waypoints (min 2)' },
    ],
    example: {
      request: `curl -X POST "${API_BASE}/route-risk" \\
  -H "Content-Type: application/json" \\
  -d '{"route": [{"lat": 34.05, "lng": -118.24}, {"lat": 36.17, "lng": -115.14}]}'`,
      response: `{
  "risk_score": 35,
  "risk_level": "MEDIUM",
  "total_distance_km": 367.2,
  "segments": [{
    "segment_index": 0,
    "distance_km": 367.2,
    "risk_score": 35,
    "risk_level": "MEDIUM",
    "hazards": [{"type": "wildfire", "severity": 0.75, "distance_km": 42.1}],
    "delay_minutes": 36,
    "recommendation": "Proceed with caution"
  }],
  "high_risk_zones": [{"lat": 35.1, "lng": -117.5, "risk_score": 58, "hazard": "wildfire"}],
  "delay_minutes": 36,
  "reroute_recommended": false,
  "recommendations": ["Estimated 36 min delay due to hazard zones"]
}`,
    },
  },
  {
    method: 'GET',
    path: '/v1/events',
    fn: 'events',
    description: 'Query real-time planetary events. Filter by type, location, and radius.',
    params: [
      { name: 'type', type: 'string', required: false, desc: 'earthquake | wildfire | air_quality' },
      { name: 'latitude', type: 'number', required: false, desc: 'Center latitude for radius search' },
      { name: 'longitude', type: 'number', required: false, desc: 'Center longitude for radius search' },
      { name: 'radius', type: 'number', required: false, desc: 'Search radius in km (default: 100)' },
      { name: 'limit', type: 'number', required: false, desc: 'Max results (default: 50, max: 200)' },
    ],
    example: {
      request: `curl "${API_BASE}/events?type=earthquake&limit=5"`,
      response: `{
  "events": [
    {
      "id": "...",
      "event_type": "earthquake",
      "title": "M5.2 - 10km NE of Tokyo",
      "latitude": 35.72,
      "longitude": 139.85,
      "severity": 0.52,
      "risk_level": "HIGH",
      "event_time": "2026-04-15T09:30:00Z"
    }
  ],
  "count": 1,
  "timestamp": "2026-04-15T10:00:00Z"
}`,
    },
  },
  {
    method: 'POST',
    path: '/v1/subscribe',
    fn: 'subscribe',
    description: 'Subscribe to location-based alerts via webhook. Requires an API key.',
    params: [
      { name: 'latitude', type: 'number', required: true, desc: 'Center latitude' },
      { name: 'longitude', type: 'number', required: true, desc: 'Center longitude' },
      { name: 'radius_km', type: 'number', required: false, desc: 'Alert radius in km (default: 100)' },
      { name: 'threshold', type: 'number', required: false, desc: 'Risk score threshold 0-100 (default: 70)' },
      { name: 'webhook_url', type: 'string', required: true, desc: 'URL to receive POST alerts' },
      { name: 'event_types', type: 'array', required: false, desc: 'Event types to watch' },
    ],
    example: {
      request: `curl -X POST "${API_BASE}/subscribe" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{"latitude": 35.68, "longitude": 139.76, "webhook_url": "https://your-app.com/webhook", "threshold": 60}'`,
      response: `{
  "success": true,
  "subscription_id": "uuid-here",
  "message": "Webhook subscription created."
}`,
    },
  },
];

const useCases = [
  {
    title: '🚛 Logistics & Supply Chain',
    desc: 'Pre-scan shipping routes for wildfire, earthquake, or air quality disruptions. Get ETA delay estimates and automated rerouting flags before dispatching vehicles.',
    example: 'POST /v1/route-risk with LA→Vegas waypoints → receive per-segment risk + 36min delay warning',
  },
  {
    title: '🏢 Insurance & Underwriting',
    desc: 'Assess real-time and predicted environmental risk for any coordinate. Power parametric insurance triggers with confidence-scored risk data.',
    example: 'GET /v1/predict-risk for a warehouse location → 6h/24h risk forecast with aftershock probability',
  },
  {
    title: '✈️ Travel & Mobility',
    desc: 'Surface safety intelligence in travel booking flows. Alert travelers to developing hazards at destinations and along routes.',
    example: 'GET /v1/risk-score for destination → contributing factors with nearest hazard distances',
  },
];

const methodColors: Record<string, string> = {
  GET: 'text-green-400 bg-green-400/10 border-green-400/20',
  POST: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
};

export default function ApiDocs() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="fixed top-0 w-full z-50 glass-panel border-b border-border/30 px-6 py-3 flex items-center gap-6">
        <span className="font-heading text-lg tracking-wider text-primary">Gotham</span>
        <div className="flex gap-4 ml-auto">
          <NavLink to="/">Globe</NavLink>
          <NavLink to="/events">Events</NavLink>
          <NavLink to="/docs">API Docs</NavLink>
          <NavLink to="/about">About</NavLink>
        </div>
      </nav>

      <div className="pt-20 px-6 max-w-5xl mx-auto pb-20">
        <div className="mb-12">
          <h1 className="font-heading text-4xl tracking-tight mb-2">API Reference</h1>
          <p className="text-muted-foreground font-mono text-sm">
            Real-time + predictive environmental risk intelligence — integrate in minutes.
          </p>
          <div className="mt-4 p-4 rounded-lg border border-primary/20 bg-primary/5">
            <p className="font-mono text-xs text-primary">BASE URL: {API_BASE}</p>
          </div>
        </div>

        {/* Quick start */}
        <section className="mb-12">
          <h2 className="font-heading text-2xl mb-4 text-foreground/90">Quick Start</h2>
          <div className="glass-panel p-6 rounded-lg border border-border/30">
            <p className="text-sm text-muted-foreground mb-3">
              Get a risk score for any coordinate — no API key needed for read endpoints:
            </p>
            <pre className="bg-black/50 p-4 rounded-md font-mono text-xs text-green-400 overflow-x-auto">
{`curl "${API_BASE}/risk-score?latitude=34.05&longitude=-118.24"`}
            </pre>
          </div>
        </section>

        {/* Use Cases */}
        <section className="mb-12">
          <h2 className="font-heading text-2xl mb-4 text-foreground/90">Use Cases</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {useCases.map((uc, i) => (
              <div key={i} className="glass-panel p-5 rounded-lg border border-border/30">
                <h3 className="font-heading text-base mb-2">{uc.title}</h3>
                <p className="text-xs text-muted-foreground mb-3">{uc.desc}</p>
                <code className="text-[10px] text-primary/70 block">{uc.example}</code>
              </div>
            ))}
          </div>
        </section>

        {/* Endpoints */}
        {endpoints.map((ep, i) => (
          <section key={i} className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <span className={`font-mono text-xs font-bold px-2 py-1 rounded border ${methodColors[ep.method]}`}>
                {ep.method}
              </span>
              <code className="font-mono text-sm text-foreground">{ep.path}</code>
            </div>
            <p className="text-sm text-muted-foreground mb-4">{ep.description}</p>

            <div className="mb-4">
              <h4 className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-2">Parameters</h4>
              <div className="border border-border/30 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/20">
                      <th className="text-left px-4 py-2 font-mono text-xs text-muted-foreground">Name</th>
                      <th className="text-left px-4 py-2 font-mono text-xs text-muted-foreground">Type</th>
                      <th className="text-left px-4 py-2 font-mono text-xs text-muted-foreground">Required</th>
                      <th className="text-left px-4 py-2 font-mono text-xs text-muted-foreground">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ep.params.map((p, j) => (
                      <tr key={j} className="border-t border-border/20">
                        <td className="px-4 py-2 font-mono text-xs text-primary">{p.name}</td>
                        <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{p.type}</td>
                        <td className="px-4 py-2">
                          {p.required ? (
                            <span className="text-xs text-amber-400">required</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">optional</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{p.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <h4 className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-1">Request</h4>
                <pre className="bg-black/50 p-4 rounded-md font-mono text-xs text-green-400 overflow-x-auto whitespace-pre-wrap">
                  {ep.example.request}
                </pre>
              </div>
              <div>
                <h4 className="font-mono text-xs text-muted-foreground uppercase tracking-wider mb-1">Response</h4>
                <pre className="bg-black/50 p-4 rounded-md font-mono text-xs text-blue-300 overflow-x-auto">
                  {ep.example.response}
                </pre>
              </div>
            </div>
          </section>
        ))}

        {/* Rate Limits */}
        <section className="mb-12">
          <h2 className="font-heading text-2xl mb-4 text-foreground/90">Rate Limits & Tiers</h2>
          <div className="border border-border/30 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/20">
                  <th className="text-left px-4 py-3 font-mono text-xs">Tier</th>
                  <th className="text-left px-4 py-3 font-mono text-xs">Rate Limit</th>
                  <th className="text-left px-4 py-3 font-mono text-xs">Predictions</th>
                  <th className="text-left px-4 py-3 font-mono text-xs">Webhooks</th>
                  <th className="text-left px-4 py-3 font-mono text-xs">Price</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border/20">
                  <td className="px-4 py-3 font-mono text-xs text-green-400">Free</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">100 req/day</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">6h only</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">1</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">$0</td>
                </tr>
                <tr className="border-t border-border/20">
                  <td className="px-4 py-3 font-mono text-xs text-blue-400">Pro</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">10,000 req/day</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">6h + 24h</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">10</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">$49/mo</td>
                </tr>
                <tr className="border-t border-border/20">
                  <td className="px-4 py-3 font-mono text-xs text-amber-400">Enterprise</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">Unlimited</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">6h + 24h + 72h</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">Unlimited</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">Custom</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Architecture */}
        <section className="mb-12">
          <h2 className="font-heading text-2xl mb-4 text-foreground/90">Architecture</h2>
          <div className="glass-panel p-6 rounded-lg border border-border/30 font-mono text-xs text-muted-foreground space-y-2">
            <p>DATA SOURCES → USGS (earthquakes) | NASA EONET (wildfires) | OpenAQ (air quality)</p>
            <p>INGESTION   → Automated every 5 min via pg_cron → normalized into planetary_events + event_history</p>
            <p>SCORING     → Distance decay (exponential) × Time decay (48h window) × Severity weighting</p>
            <p>PREDICTION  → Omori aftershock model | Wildfire spread vectors | AQI trend regression</p>
            <p>CACHING     → Grid-based (~11km) with 2-min TTL via PostGIS</p>
            <p>DELIVERY    → Edge Functions (global, &lt;100ms cold start) | Webhook alerts | REST API</p>
          </div>
        </section>
      </div>
    </div>
  );
}
