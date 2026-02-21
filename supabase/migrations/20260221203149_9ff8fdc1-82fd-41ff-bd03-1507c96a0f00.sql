
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS payout_frequency TEXT NOT NULL DEFAULT 'WEEKLY',
  ADD COLUMN IF NOT EXISTS payout_week_end_day INTEGER NOT NULL DEFAULT 0;
-- 0=Sunday, 1=Monday, ..., 6=Saturday

COMMENT ON COLUMN public.organizations.payout_week_end_day IS '0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday';
