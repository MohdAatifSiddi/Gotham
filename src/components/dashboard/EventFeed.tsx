import { PlanetaryEvent, EVENT_COLORS, RISK_COLORS } from '@/types/events';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Activity, Flame, Wind } from 'lucide-react';
import { cn } from '@/lib/utils';

const TypeIcon = ({ type }: { type: PlanetaryEvent['type'] }) => {
  switch (type) {
    case 'earthquake': return <Activity className="h-3.5 w-3.5 text-earthquake" />;
    case 'wildfire': return <Flame className="h-3.5 w-3.5 text-wildfire" />;
    case 'airquality': return <Wind className="h-3.5 w-3.5 text-airquality" />;
  }
};

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

interface EventFeedProps {
  events: PlanetaryEvent[];
  selectedEvent: PlanetaryEvent | null;
  onSelectEvent: (e: PlanetaryEvent) => void;
  filter: string | null;
  onFilterChange: (f: string | null) => void;
}

export default function EventFeed({
  events,
  selectedEvent,
  onSelectEvent,
  filter,
  onFilterChange,
}: EventFeedProps) {
  const filtered = filter ? events.filter(e => e.type === filter) : events;

  return (
    <div className="glass-panel flex h-full w-72 flex-col rounded-lg">
      <div className="border-b border-border/50 p-3">
        <h2 className="font-heading text-xs font-semibold tracking-widest text-muted-foreground">
          LIVE EVENT FEED
        </h2>
        <div className="mt-2 flex gap-1">
          {[null, 'earthquake', 'wildfire', 'airquality'].map((f) => (
            <button
              key={f || 'all'}
              onClick={() => onFilterChange(f)}
              className={cn(
                'rounded px-2 py-0.5 text-[10px] font-mono transition-colors',
                filter === f
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {f ? f.toUpperCase().slice(0, 4) : 'ALL'}
            </button>
          ))}
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-0.5 p-1">
          {filtered.slice(0, 100).map((event) => (
            <button
              key={event.id}
              onClick={() => onSelectEvent(event)}
              className={cn(
                'flex w-full items-start gap-2 rounded p-2 text-left transition-colors',
                selectedEvent?.id === event.id
                  ? 'bg-primary/10 border border-primary/20'
                  : 'hover:bg-accent/50'
              )}
            >
              <TypeIcon type={event.type} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">
                  {event.title}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {event.description}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: RISK_COLORS[event.riskLevel] }}
                />
                <span className="text-[9px] text-muted-foreground font-mono">
                  {timeAgo(event.timestamp)}
                </span>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="p-4 text-center text-xs text-muted-foreground">
              No events detected
            </p>
          )}
        </div>
      </ScrollArea>
      <div className="border-t border-border/50 p-2">
        <p className="text-center text-[9px] font-mono text-muted-foreground">
          {filtered.length} EVENTS TRACKED
        </p>
      </div>
    </div>
  );
}
