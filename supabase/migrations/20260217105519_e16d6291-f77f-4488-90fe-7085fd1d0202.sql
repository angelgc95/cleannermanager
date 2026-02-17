-- Drop the partial unique index and create a proper unique constraint
DROP INDEX IF EXISTS bookings_external_uid_key;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_external_uid_unique UNIQUE (external_uid);