
-- Usage logs for API monetization tracking
CREATE TABLE public.usage_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id uuid REFERENCES public.api_keys(id) ON DELETE SET NULL,
  endpoint text NOT NULL,
  method text NOT NULL DEFAULT 'GET',
  status_code integer NOT NULL DEFAULT 200,
  response_time_ms integer,
  request_params jsonb,
  ip_address text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for analytics queries
CREATE INDEX idx_usage_logs_api_key ON public.usage_logs(api_key_id);
CREATE INDEX idx_usage_logs_created_at ON public.usage_logs(created_at DESC);
CREATE INDEX idx_usage_logs_endpoint ON public.usage_logs(endpoint);

-- RLS: usage logs readable by key owner
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own usage logs"
ON public.usage_logs FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.api_keys
  WHERE api_keys.id = usage_logs.api_key_id
  AND api_keys.user_id = auth.uid()
));

-- Event history for long-term storage and trend analysis
CREATE TABLE public.event_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type text NOT NULL,
  title text NOT NULL,
  description text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  location geography(Point, 4326),
  severity double precision NOT NULL DEFAULT 0,
  risk_level text NOT NULL DEFAULT 'LOW',
  source text NOT NULL,
  source_id text,
  raw_data jsonb,
  event_time timestamp with time zone NOT NULL DEFAULT now(),
  archived_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_history_type ON public.event_history(event_type);
CREATE INDEX idx_event_history_time ON public.event_history(event_time DESC);
CREATE INDEX idx_event_history_location ON public.event_history USING GIST(location);

ALTER TABLE public.event_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read event history"
ON public.event_history FOR SELECT
USING (true);

-- Auto-populate location column on event_history
CREATE OR REPLACE FUNCTION public.set_event_history_location()
RETURNS TRIGGER AS $$
BEGIN
  NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_event_history_location
BEFORE INSERT OR UPDATE ON public.event_history
FOR EACH ROW EXECUTE FUNCTION public.set_event_history_location();
