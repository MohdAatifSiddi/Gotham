import { useQuery } from '@tanstack/react-query';
import { PlanetaryEvent, RiskLevel } from '@/types/events';

function getFireRisk(confidence: number): RiskLevel {
  if (confidence >= 90) return 'critical';
  if (confidence >= 70) return 'high';
  if (confidence >= 50) return 'moderate';
  return 'low';
}

async function fetchWildfires(): Promise<PlanetaryEvent[]> {
  // NASA FIRMS provides a CSV feed. We use the MODIS 24h global feed.
  // Fallback: use EONET API for natural events including wildfires.
  try {
    const res = await fetch(
      'https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&status=open&limit=100'
    );
    if (!res.ok) throw new Error('EONET failed');
    const data = await res.json();

    return data.events.map((e: any) => {
      const geo = e.geometry?.[0];
      const coords = geo?.coordinates || [0, 0];
      const confidence = 75; // EONET doesn't provide confidence, default to high
      return {
        id: e.id,
        type: 'wildfire' as const,
        title: e.title,
        description: `Source: ${e.sources?.[0]?.id || 'NASA'}`,
        latitude: coords[1],
        longitude: coords[0],
        severity: confidence / 100,
        riskLevel: getFireRisk(confidence),
        timestamp: new Date(geo?.date || Date.now()),
        raw: e,
      };
    });
  } catch {
    return [];
  }
}

export function useWildfires() {
  return useQuery({
    queryKey: ['wildfires'],
    queryFn: fetchWildfires,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
  });
}
