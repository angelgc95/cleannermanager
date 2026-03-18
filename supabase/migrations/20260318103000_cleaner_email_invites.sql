DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'host_cleaner_status'
  ) THEN
    CREATE TYPE public.host_cleaner_status AS ENUM ('INVITED', 'ACTIVE');
  END IF;
END $$;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS setup_completed boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.host_cleaners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_user_id uuid NOT NULL,
  cleaner_user_id uuid NOT NULL,
  invited_email text,
  status public.host_cleaner_status NOT NULL DEFAULT 'INVITED',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (host_user_id, cleaner_user_id)
);

ALTER TABLE public.host_cleaners ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_host_cleaners_host_status
ON public.host_cleaners (host_user_id, status, created_at DESC);

DROP POLICY IF EXISTS "Host can manage host cleaners" ON public.host_cleaners;
CREATE POLICY "Host can manage host cleaners"
ON public.host_cleaners
FOR ALL
USING (host_user_id = auth.uid())
WITH CHECK (host_user_id = auth.uid());

DROP POLICY IF EXISTS "Cleaner can view own host cleaners" ON public.host_cleaners;
CREATE POLICY "Cleaner can view own host cleaners"
ON public.host_cleaners
FOR SELECT
USING (cleaner_user_id = auth.uid());
