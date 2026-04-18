import { SystemStatus } from '@/types/events';
import { Activity, Flame, Wind, AlertTriangle } from 'lucide-react';

interface StatusBarProps {
  status: SystemStatus;
  isLoading: boolean;
}

export default function StatusBar({ status, isLoading }: StatusBarProps) {
  const totalCritical =
    status.earthquakes.critical + status.wildfires.critical + status.airquality.critical;

  return (
    <div className="glass-panel flex items-center justify-between px-4 py-2 text-xs font-mono">
      <div className="flex items-center gap-2">
        <span className="font-heading text-sm font-semibold tracking-wider text-foreground">
          EARTH-OS
        </span>
        <span className="text-muted-foreground">v1.0.0</span>
        <div className={`h-2 w-2 rounded-full ${isLoading ? 'bg-warning animate-pulse' : 'bg-success'}`} />
        <span className="text-muted-foreground">
          {isLoading ? 'SYNCING' : 'OPERATIONAL'}
        </span>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-earthquake" />
          <span className="text-muted-foreground">EQ</span>
          <span className="text-foreground">{status.earthquakes.count}</span>
          {status.earthquakes.critical > 0 && (
            <span className="text-destructive">({status.earthquakes.critical})</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Flame className="h-3.5 w-3.5 text-wildfire" />
          <span className="text-muted-foreground">FIRE</span>
          <span className="text-foreground">{status.wildfires.count}</span>
          {status.wildfires.critical > 0 && (
            <span className="text-destructive">({status.wildfires.critical})</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Wind className="h-3.5 w-3.5 text-airquality" />
          <span className="text-muted-foreground">AQ</span>
          <span className="text-foreground">{status.airquality.count}</span>
          {status.airquality.critical > 0 && (
            <span className="text-destructive">({status.airquality.critical})</span>
          )}
        </div>
        {totalCritical > 0 && (
          <div className="flex items-center gap-1.5 text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 animate-pulse-dot" />
            <span>{totalCritical} CRITICAL</span>
          </div>
        )}
      </div>

      <div className="text-muted-foreground">
        {status.lastUpdate.toLocaleTimeString()} UTC
      </div>
    </div>
  );
}
