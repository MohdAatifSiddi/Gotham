import { useMemo } from 'react';
import { useEarthquakes } from './useEarthquakes';
import { useWildfires } from './useWildfires';
import { useAirQuality } from './useAirQuality';
import { PlanetaryEvent, SystemStatus } from '@/types/events';

export function usePlanetaryData() {
  const earthquakes = useEarthquakes();
  const wildfires = useWildfires();
  const airquality = useAirQuality();

  const allEvents = useMemo<PlanetaryEvent[]>(() => {
    const events: PlanetaryEvent[] = [
      ...(earthquakes.data || []),
      ...(wildfires.data || []),
      ...(airquality.data || []),
    ];
    return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [earthquakes.data, wildfires.data, airquality.data]);

  const status = useMemo<SystemStatus>(() => {
    const eq = earthquakes.data || [];
    const wf = wildfires.data || [];
    const aq = airquality.data || [];
    return {
      earthquakes: {
        count: eq.length,
        critical: eq.filter(e => e.riskLevel === 'critical' || e.riskLevel === 'high').length,
      },
      wildfires: {
        count: wf.length,
        critical: wf.filter(e => e.riskLevel === 'critical' || e.riskLevel === 'high').length,
      },
      airquality: {
        count: aq.length,
        critical: aq.filter(e => e.riskLevel === 'critical' || e.riskLevel === 'high').length,
      },
      lastUpdate: new Date(),
    };
  }, [earthquakes.data, wildfires.data, airquality.data]);

  const isLoading = earthquakes.isLoading || wildfires.isLoading || airquality.isLoading;
  const isError = earthquakes.isError && wildfires.isError && airquality.isError;

  return { allEvents, status, isLoading, isError };
}
