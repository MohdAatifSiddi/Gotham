import { useQuery } from '@tanstack/react-query';
import { PlanetaryEvent, RiskLevel } from '@/types/events';

function getAQIRisk(value: number): RiskLevel {
  if (value > 200) return 'critical';
  if (value > 150) return 'high';
  if (value > 100) return 'moderate';
  return 'low';
}

async function fetchAirQuality(): Promise<PlanetaryEvent[]> {
  try {
    const res = await fetch(
      'https://api.openaq.org/v2/measurements?limit=100&order_by=datetime&sort=desc&parameter=pm25&value_from=50'
    );
    if (!res.ok) throw new Error('OpenAQ failed');
    const data = await res.json();

    return data.results
      .filter((r: any) => r.coordinates?.latitude && r.coordinates?.longitude)
      .map((r: any, i: number) => {
        const value = r.value || 0;
        return {
          id: `aq-${r.locationId}-${i}`,
          type: 'airquality' as const,
          title: `PM2.5: ${value.toFixed(1)} µg/m³`,
          description: `${r.location || 'Unknown'}, ${r.country || ''}`,
          latitude: r.coordinates.latitude,
          longitude: r.coordinates.longitude,
          severity: Math.min(value / 300, 1),
          riskLevel: getAQIRisk(value),
          timestamp: new Date(r.date?.utc || Date.now()),
          raw: r,
        };
      });
  } catch {
    return [];
  }
}

export function useAirQuality() {
  return useQuery({
    queryKey: ['airquality'],
    queryFn: fetchAirQuality,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
  });
}
