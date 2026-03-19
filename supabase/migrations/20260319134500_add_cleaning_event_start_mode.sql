ALTER TABLE public.host_settings
  ADD COLUMN IF NOT EXISTS cleaning_event_start_mode text NOT NULL DEFAULT 'UPCOMING_BOOKING_CHECKIN';

ALTER TABLE public.host_settings
  DROP CONSTRAINT IF EXISTS host_settings_cleaning_event_start_mode_check;

ALTER TABLE public.host_settings
  ADD CONSTRAINT host_settings_cleaning_event_start_mode_check
  CHECK (cleaning_event_start_mode IN ('CURRENT_BOOKING_CHECKOUT', 'UPCOMING_BOOKING_CHECKIN'));

COMMENT ON COLUMN public.host_settings.cleaning_event_start_mode IS 'Controls whether iCal cleaning events anchor to the current booking checkout date (DTEND) or the upcoming booking check-in date (DTSTART).';
