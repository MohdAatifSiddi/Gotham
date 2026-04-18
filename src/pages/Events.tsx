import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { usePlanetaryData } from '@/hooks/usePlanetaryData';
import { PlanetaryEvent, RISK_COLORS, EventType } from '@/types/events';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Activity, Flame, Wind, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const TypeIcon = ({ type }: { type: EventType }) => {
  switch (type) {
    case 'earthquake': return <Activity className="h-3.5 w-3.5 text-earthquake" />;
    case 'wildfire': return <Flame className="h-3.5 w-3.5 text-wildfire" />;
    case 'airquality': return <Wind className="h-3.5 w-3.5 text-airquality" />;
  }
};

export default function Events() {
  const { allEvents } = usePlanetaryData();
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'time' | 'severity'>('time');

  const filtered = useMemo(() => {
    let events = typeFilter ? allEvents.filter(e => e.type === typeFilter) : allEvents;
    if (sortBy === 'severity') {
      events = [...events].sort((a, b) => b.severity - a.severity);
    }
    return events;
  }, [allEvents, typeFilter, sortBy]);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center gap-4 mb-6">
          <Link to="/" className="glass-panel rounded-lg p-2 hover:bg-accent transition-colors">
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </Link>
          <div>
            <h1 className="font-heading text-xl font-bold tracking-tight">Event Log</h1>
            <p className="text-xs font-mono text-muted-foreground">
              {allEvents.length} EVENTS TRACKED
            </p>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          {[null, 'earthquake', 'wildfire', 'airquality'].map((f) => (
            <button
              key={f || 'all'}
              onClick={() => setTypeFilter(f)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-mono transition-colors',
                typeFilter === f
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'glass-panel text-muted-foreground hover:text-foreground'
              )}
            >
              {f ? f.toUpperCase() : 'ALL'}
            </button>
          ))}
          <button
            onClick={() => setSortBy(s => s === 'time' ? 'severity' : 'time')}
            className="ml-auto glass-panel flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-mono text-muted-foreground hover:text-foreground"
          >
            <ArrowUpDown className="h-3 w-3" />
            {sortBy === 'time' ? 'BY TIME' : 'BY SEVERITY'}
          </button>
        </div>

        <div className="glass-panel rounded-lg overflow-hidden">
          <ScrollArea className="h-[calc(100vh-200px)]">
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="font-mono text-[10px] tracking-wider">TYPE</TableHead>
                  <TableHead className="font-mono text-[10px] tracking-wider">EVENT</TableHead>
                  <TableHead className="font-mono text-[10px] tracking-wider">LOCATION</TableHead>
                  <TableHead className="font-mono text-[10px] tracking-wider">RISK</TableHead>
                  <TableHead className="font-mono text-[10px] tracking-wider">SEVERITY</TableHead>
                  <TableHead className="font-mono text-[10px] tracking-wider">TIME</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 200).map((event) => (
                  <TableRow key={event.id} className="border-border/30 hover:bg-accent/30">
                    <TableCell><TypeIcon type={event.type} /></TableCell>
                    <TableCell className="text-xs font-medium">{event.title}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{event.description}</TableCell>
                    <TableCell>
                      <span
                        className="text-[10px] font-mono font-semibold uppercase"
                        style={{ color: RISK_COLORS[event.riskLevel] }}
                      >
                        {event.riskLevel}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-secondary overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${event.severity * 100}%`,
                              backgroundColor: RISK_COLORS[event.riskLevel],
                            }}
                          />
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {(event.severity * 100).toFixed(0)}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {event.timestamp.toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
