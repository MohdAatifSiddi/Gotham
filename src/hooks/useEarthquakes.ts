import { useQuery } from '@tanstack/react-query';
import { PlanetaryEvent, RiskLevel } from '@/types/events';

function getMagnitudeRisk(mag: number): RiskLevel {
  if (mag >= 7) return 'critical';
  if (mag >= 5) return 'high';
  if (mag >= 3) return 'moderate';
  return 'low';
}

function normalizeSeverity(mag: number): number {
  return Math.min(mag / 9, 1);
}

async function fetchEarthquakes(): Promise<PlanetaryEvent[]> {
  const res = await fetch(
    'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'
  );
  if (!res.ok) throw new Error('Failed to fetch earthquakes');
  const data = await res.json();

  return data.features.map((f: any) => {
    const [lng, lat] = f.geometry.coordinates;
    const mag = f.properties.mag || 0;
    return {
      id: f.id,
      type: 'earthquake' as const,
      title: f.properties.title || `M${mag} Earthquake`,
      description: f.properties.place || 'Unknown location',
      latitude: lat,
      longitude: lng,
      severity: normalizeSeverity(mag),
      riskLevel: getMagnitudeRisk(mag),
      timestamp: new Date(f.properties.time),
      raw: { magnitude: mag, depth: f.geometry.coordinates[2], ...f.properties },
    };
  });
}

export function useEarthquakes() {
  return useQuery({
    queryKey: ['earthquakes'],
    queryFn: fetchEarthquakes,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
  });
}
