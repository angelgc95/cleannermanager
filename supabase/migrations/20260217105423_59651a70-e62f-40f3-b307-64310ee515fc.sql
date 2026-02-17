-- Add unique constraint on external_uid for upsert support
CREATE UNIQUE INDEX IF NOT EXISTS bookings_external_uid_key ON public.bookings (external_uid) WHERE external_uid IS NOT NULL;