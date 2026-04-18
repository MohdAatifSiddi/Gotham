import { useState } from 'react';
import { Link } from 'react-router-dom';
import EarthGlobe from '@/components/globe/EarthGlobe';
import StatusBar from '@/components/dashboard/StatusBar';
import EventFeed from '@/components/dashboard/EventFeed';
import EventDetail from '@/components/dashboard/EventDetail';
import { usePlanetaryData } from '@/hooks/usePlanetaryData';
import { PlanetaryEvent } from '@/types/events';
import { List, Info, Loader2 } from 'lucide-react';

export default function Index() {
  const { allEvents, status, isLoading } = usePlanetaryData();
  const [selectedEvent, setSelectedEvent] = useState<PlanetaryEvent | null>(null);
  const [filter, setFilter] = useState<string | null>(null);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      {/* Globe */}
      <EarthGlobe
        events={allEvents}
        selectedEvent={selectedEvent}
        onSelectEvent={setSelectedEvent}
      />

      {/* Loading overlay */}
      {isLoading && allEvents.length === 0 && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 font-heading text-sm tracking-widest text-muted-foreground">
            INITIALIZING Gotham
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            Connecting to planetary data feeds...
          </p>
        </div>
      )}

      {/* Status bar (top) */}
      <div className="absolute left-0 right-0 top-0 z-10">
        <StatusBar status={status} isLoading={isLoading} />
      </div>

      {/* Event feed (left) */}
      <div className="absolute bottom-4 left-4 top-14 z-10">
        <EventFeed
          events={allEvents}
          selectedEvent={selectedEvent}
          onSelectEvent={setSelectedEvent}
          filter={filter}
          onFilterChange={setFilter}
        />
      </div>

      {/* Event detail (right) */}
      {selectedEvent && (
        <div className="absolute right-4 top-14 z-10">
          <EventDetail
            event={selectedEvent}
            onClose={() => setSelectedEvent(null)}
          />
        </div>
      )}

      {/* Nav links (bottom right) */}
      <div className="absolute bottom-4 right-4 z-10 flex gap-2">
        <Link
          to="/events"
          className="glass-panel flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
        >
          <List className="h-3.5 w-3.5" />
          EVENTS TABLE
        </Link>
        <Link
          to="/about"
          className="glass-panel flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
        >
          <Info className="h-3.5 w-3.5" />
          ABOUT
        </Link>
      </div>
    </div>
  );
}
