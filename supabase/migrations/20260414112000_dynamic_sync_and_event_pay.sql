ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

UPDATE public.bookings
SET last_seen_at = COALESCE(last_seen_at, updated_at, created_at)
WHERE last_seen_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_listing_platform_last_seen
  ON public.bookings (listing_id, source_platform, last_seen_at);

COMMENT ON COLUMN public.bookings.last_seen_at IS
  'Timestamp of the last successful iCal sync that still included this booking.';

ALTER TABLE public.host_settings
  ADD COLUMN IF NOT EXISTS payout_model text NOT NULL DEFAULT 'HOURLY',
  ADD COLUMN IF NOT EXISTS default_event_rate numeric NOT NULL DEFAULT 0;

ALTER TABLE public.host_settings
  DROP CONSTRAINT IF EXISTS host_settings_payout_model_check;

ALTER TABLE public.host_settings
  ADD CONSTRAINT host_settings_payout_model_check
  CHECK (payout_model IN ('HOURLY', 'PER_EVENT_PLUS_HOURLY'));

COMMENT ON COLUMN public.host_settings.payout_model IS
  'Compensation model used for cleaner payouts: HOURLY or PER_EVENT_PLUS_HOURLY.';

COMMENT ON COLUMN public.host_settings.default_event_rate IS
  'Flat amount paid per completed checklist event when payout_model is PER_EVENT_PLUS_HOURLY.';

ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS payout_model text NOT NULL DEFAULT 'HOURLY',
  ADD COLUMN IF NOT EXISTS event_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS event_rate_used numeric(10,2);

ALTER TABLE public.payouts
  DROP CONSTRAINT IF EXISTS payouts_payout_model_check;

ALTER TABLE public.payouts
  ADD CONSTRAINT payouts_payout_model_check
  CHECK (payout_model IN ('HOURLY', 'PER_EVENT_PLUS_HOURLY'));

COMMENT ON COLUMN public.payouts.payout_model IS
  'Snapshot of the compensation model used when the payout was generated.';

COMMENT ON COLUMN public.payouts.event_count IS
  'Number of completed checklist events included in this payout when using per-event pay.';

COMMENT ON COLUMN public.payouts.event_rate_used IS
  'Per-event amount used for completed checklist events in this payout.';
