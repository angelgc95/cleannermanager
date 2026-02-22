
-- Add location + pricing columns to listings
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS country_code text,
  ADD COLUMN IF NOT EXISTS lat numeric,
  ADD COLUMN IF NOT EXISTS lng numeric,
  ADD COLUMN IF NOT EXISTS base_nightly_price numeric;

-- Add pricing suggestion settings to host_settings
ALTER TABLE public.host_settings
  ADD COLUMN IF NOT EXISTS nightly_price_suggestions_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suggestion_radius_km numeric NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS suggestion_days_ahead integer NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS max_uplift_pct numeric NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS min_uplift_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weights_json jsonb NOT NULL DEFAULT '{"music":1.5,"festival":2.0,"sports":1.0,"bank_holiday":1.2,"weekend":0.5}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_refreshed_at timestamptz;

-- Create events_cache table
CREATE TABLE IF NOT EXISTS public.events_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  host_user_id uuid NOT NULL,
  location_key text NOT NULL,
  date date NOT NULL,
  category text NOT NULL,
  title text NOT NULL,
  venue text,
  start_time timestamptz,
  popularity_score numeric,
  source text NOT NULL,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.events_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Host can manage own events_cache" ON public.events_cache
  FOR ALL USING (host_user_id = auth.uid());

-- Create pricing_suggestions table
CREATE TABLE IF NOT EXISTS public.pricing_suggestions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  host_user_id uuid NOT NULL,
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  date date NOT NULL,
  base_price numeric NOT NULL,
  suggested_price numeric NOT NULL,
  uplift_pct numeric NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0,
  color_level text NOT NULL DEFAULT 'green',
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  reviewed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(listing_id, date)
);

ALTER TABLE public.pricing_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Host can manage own pricing_suggestions" ON public.pricing_suggestions
  FOR ALL USING (host_user_id = auth.uid());

-- Index for fast calendar lookups
CREATE INDEX IF NOT EXISTS idx_pricing_suggestions_listing_date ON public.pricing_suggestions(listing_id, date);
CREATE INDEX IF NOT EXISTS idx_events_cache_location_date ON public.events_cache(location_key, date);
