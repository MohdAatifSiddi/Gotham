import { PlanetaryEvent, EVENT_COLORS, RISK_COLORS } from '@/types/events';
import { X, MapPin, Clock, AlertTriangle, Activity, Flame, Wind } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EventDetailProps {
  event: PlanetaryEvent;
  onClose: () => void;
}

export default function EventDetail({ event, onClose }: EventDetailProps) {
  const riskColor = RISK_COLORS[event.riskLevel];

  return (
    <div className="glass-panel w-80 rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {event.type === 'earthquake' && <Activity className="h-4 w-4 text-earthquake" />}
          {event.type === 'wildfire' && <Flame className="h-4 w-4 text-wildfire" />}
          {event.type === 'airquality' && <Wind className="h-4 w-4 text-airquality" />}
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            {event.type}
          </span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-3 w-3" />
        </Button>
      </div>

      <h3 className="mt-3 font-heading text-sm font-semibold text-foreground">
        {event.title}
      </h3>

      <div className="mt-3 space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3" />
          <span>{event.description}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>{event.timestamp.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <AlertTriangle className="h-3 w-3" style={{ color: riskColor }} />
          <span style={{ color: riskColor }} className="font-mono uppercase font-semibold">
            {event.riskLevel} RISK
          </span>
        </div>
      </div>

      <div className="mt-4">
        <div className="text-[10px] font-mono text-muted-foreground mb-1">SEVERITY</div>
        <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${event.severity * 100}%`,
              backgroundColor: riskColor,
            }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[9px] font-mono text-muted-foreground">
          <span>0</span>
          <span>{(event.severity * 100).toFixed(0)}%</span>
        </div>
      </div>

      <div className="mt-4">
        <div className="text-[10px] font-mono text-muted-foreground mb-1">COORDINATES</div>
        <div className="font-mono text-xs text-foreground">
          {event.latitude.toFixed(4)}° N, {event.longitude.toFixed(4)}° E
        </div>
      </div>

      {event.type === 'earthquake' && event.raw.magnitude && (
        <div className="mt-4">
          <div className="text-[10px] font-mono text-muted-foreground mb-1">MAGNITUDE</div>
          <div className="font-mono text-2xl font-bold text-earthquake">
            M{event.raw.magnitude.toFixed(1)}
          </div>
        </div>
      )}
    </div>
  );
}
