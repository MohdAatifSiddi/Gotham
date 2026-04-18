import { Link } from 'react-router-dom';
import { ArrowLeft, Globe, Activity, Flame, Wind, Shield, Github } from 'lucide-react';

export default function About() {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-4 mb-8">
          <Link to="/" className="glass-panel rounded-lg p-2 hover:bg-accent transition-colors">
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </Link>
          <h1 className="font-heading text-xl font-bold tracking-tight">About EARTH-OS</h1>
        </div>

        <div className="space-y-6">
          <div className="glass-panel rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <Globe className="h-5 w-5 text-primary" />
              <h2 className="font-heading text-lg font-semibold">Open Planetary Defense System</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              EARTH-OS is a real-time planetary intelligence and disaster prediction platform.
              It aggregates global environmental data, detects anomalies, and provides actionable
              intelligence to make natural disasters more predictable, visible, and actionable.
            </p>
          </div>

          <div className="glass-panel rounded-lg p-6">
            <h2 className="font-heading text-sm font-semibold tracking-widest text-muted-foreground mb-4">
              DATA SOURCES
            </h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Activity className="h-4 w-4 text-earthquake mt-0.5" />
                <div>
                  <h3 className="text-sm font-medium">USGS Earthquake Hazards Program</h3>
                  <p className="text-xs text-muted-foreground">
                    Real-time earthquake data from the United States Geological Survey.
                    GeoJSON feed updated every minute.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Flame className="h-4 w-4 text-wildfire mt-0.5" />
                <div>
                  <h3 className="text-sm font-medium">NASA EONET / FIRMS</h3>
                  <p className="text-xs text-muted-foreground">
                    Active wildfire events from NASA's Earth Observatory Natural Event Tracker
                    and Fire Information for Resource Management System.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Wind className="h-4 w-4 text-airquality mt-0.5" />
                <div>
                  <h3 className="text-sm font-medium">OpenAQ</h3>
                  <p className="text-xs text-muted-foreground">
                    Global air quality measurements from monitoring stations worldwide.
                    Focuses on PM2.5 particulate matter readings.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="glass-panel rounded-lg p-6">
            <h2 className="font-heading text-sm font-semibold tracking-widest text-muted-foreground mb-4">
              RISK DETECTION
            </h2>
            <div className="space-y-3 text-xs font-mono">
              <div className="flex items-center gap-2">
                <Shield className="h-3.5 w-3.5 text-success" />
                <span className="text-success">LOW</span>
                <span className="text-muted-foreground">— EQ &lt; M3.0 | AQI &lt; 100</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-3.5 w-3.5 text-warning" />
                <span className="text-warning">MODERATE</span>
                <span className="text-muted-foreground">— EQ M3.0-5.0 | AQI 100-150</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-3.5 w-3.5 text-destructive" />
                <span className="text-destructive">HIGH</span>
                <span className="text-muted-foreground">— EQ M5.0-7.0 | AQI 150-200</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-3.5 w-3.5 text-destructive animate-pulse-dot" />
                <span className="text-destructive font-bold">CRITICAL</span>
                <span className="text-muted-foreground">— EQ ≥ M7.0 | AQI &gt; 200</span>
              </div>
            </div>
          </div>

          <div className="glass-panel rounded-lg p-6">
            <h2 className="font-heading text-sm font-semibold tracking-widest text-muted-foreground mb-3">
              ARCHITECTURE
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Built with React, Three.js (React Three Fiber), and TanStack Query.
              Data is fetched client-side from free, publicly available APIs with 5-minute
              auto-refresh intervals. Risk detection uses rule-based threshold logic.
              All code is open-source and designed for extensibility.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
