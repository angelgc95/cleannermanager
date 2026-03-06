-- Phase 5: ready-by deadline derived from listing check-in local time

ALTER TABLE public.v1_listings
  ADD COLUMN IF NOT EXISTS checkin_time_local text NOT NULL DEFAULT '15:00',
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC';

ALTER TABLE public.v1_events
  ADD COLUMN IF NOT EXISTS ready_by_override_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS v1_events_org_end_idx
  ON public.v1_events(organization_id, end_at);
