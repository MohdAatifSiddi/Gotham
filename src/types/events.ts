export type EventType = 'earthquake' | 'wildfire' | 'airquality';
export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical';

export interface PlanetaryEvent {
  id: string;
  type: EventType;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  severity: number; // 0-1 normalized
  riskLevel: RiskLevel;
  timestamp: Date;
  raw: Record<string, any>;
}

export interface SystemStatus {
  earthquakes: { count: number; critical: number };
  wildfires: { count: number; critical: number };
  airquality: { count: number; critical: number };
  lastUpdate: Date;
}

export const RISK_COLORS: Record<RiskLevel, string> = {
  low: '#22C55E',
  moderate: '#F59E0B',
  high: '#EF4444',
  critical: '#DC2626',
};

export const EVENT_COLORS: Record<EventType, string> = {
  earthquake: '#EF4444',
  wildfire: '#F97316',
  airquality: '#A855F7',
};
