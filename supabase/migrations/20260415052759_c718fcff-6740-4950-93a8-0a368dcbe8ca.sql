
-- Enable PostGIS for geospatial queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create enum types
CREATE TYPE public.event_type AS ENUM ('earthquake', 'wildfire', 'air_quality');
CREATE TYPE public.risk_level AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE public.api_tier AS ENUM ('free', 'pro', 'enterprise');

-- Planetary events table (ingested from external sources)
CREATE TABLE public.planetary_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type public.event_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  location GEOGRAPHY(POINT, 4326),
  severity DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (severity >= 0 AND severity <= 1),
  risk_level public.risk_level NOT NULL DEFAULT 'LOW',
  source TEXT NOT NULL,
  source_id TEXT,
  raw_data JSONB,
  event_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(source, source_id)
);

-- Auto-populate geography column
CREATE OR REPLACE FUNCTION public.set_event_location()
RETURNS TRIGGER AS $$
BEGIN
  NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER set_event_location_trigger
  BEFORE INSERT OR UPDATE ON public.planetary_events
  FOR EACH ROW EXECUTE FUNCTION public.set_event_location();

-- Spatial index
CREATE INDEX idx_events_location ON public.planetary_events USING GIST (location);
CREATE INDEX idx_events_type ON public.planetary_events (event_type);
CREATE INDEX idx_events_time ON public.planetary_events (event_time DESC);

-- API keys table
CREATE TABLE public.api_keys (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT 'Default',
  tier public.api_tier NOT NULL DEFAULT 'free',
  rate_limit INTEGER NOT NULL DEFAULT 100,
  request_count BIGINT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_api_keys_hash ON public.api_keys (key_hash);

-- Risk cache table (grid-based caching)
CREATE TABLE public.risk_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lat_grid DOUBLE PRECISION NOT NULL,
  lng_grid DOUBLE PRECISION NOT NULL,
  risk_score INTEGER NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_level public.risk_level NOT NULL,
  factors TEXT[] NOT NULL DEFAULT '{}',
  confidence DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  recommendation TEXT NOT NULL DEFAULT 'proceed',
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(lat_grid, lng_grid)
);

CREATE INDEX idx_risk_cache_grid ON public.risk_cache (lat_grid, lng_grid);
CREATE INDEX idx_risk_cache_expires ON public.risk_cache (expires_at);

-- Alert subscriptions table
CREATE TABLE public.alert_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  location GEOGRAPHY(POINT, 4326),
  radius_km DOUBLE PRECISION NOT NULL DEFAULT 100,
  threshold INTEGER NOT NULL DEFAULT 70,
  webhook_url TEXT NOT NULL,
  event_types public.event_type[] NOT NULL DEFAULT '{earthquake,wildfire,air_quality}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Auto-populate subscription location
CREATE TRIGGER set_subscription_location_trigger
  BEFORE INSERT OR UPDATE ON public.alert_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_event_location();

-- RLS Policies
ALTER TABLE public.planetary_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_subscriptions ENABLE ROW LEVEL SECURITY;

-- Events: public read
CREATE POLICY "Anyone can read events" ON public.planetary_events FOR SELECT USING (true);

-- API keys: owner only
CREATE POLICY "Users can view their own API keys" ON public.api_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own API keys" ON public.api_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own API keys" ON public.api_keys FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own API keys" ON public.api_keys FOR DELETE USING (auth.uid() = user_id);

-- Risk cache: public read
CREATE POLICY "Anyone can read risk cache" ON public.risk_cache FOR SELECT USING (true);

-- Alert subscriptions: owner via api_key
CREATE POLICY "Users can manage subscriptions via their API keys" ON public.alert_subscriptions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.api_keys WHERE id = api_key_id AND user_id = auth.uid())
  );

-- Service role policies for edge functions to write data
CREATE POLICY "Service can insert events" ON public.planetary_events FOR INSERT WITH CHECK (true);
CREATE POLICY "Service can update events" ON public.planetary_events FOR UPDATE USING (true);
CREATE POLICY "Service can manage risk cache" ON public.risk_cache FOR ALL USING (true);
