
-- Remove overly permissive service-role policies (service role bypasses RLS anyway)
DROP POLICY IF EXISTS "Service can insert events" ON public.planetary_events;
DROP POLICY IF EXISTS "Service can update events" ON public.planetary_events;
DROP POLICY IF EXISTS "Service can manage risk cache" ON public.risk_cache;
