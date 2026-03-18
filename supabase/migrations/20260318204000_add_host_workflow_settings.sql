ALTER TABLE public.host_settings
  ADD COLUMN IF NOT EXISTS payout_shortcut_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS payout_run_time time NOT NULL DEFAULT '17:00:00',
  ADD COLUMN IF NOT EXISTS payout_run_timezone text NOT NULL DEFAULT 'Europe/Madrid',
  ADD COLUMN IF NOT EXISTS expense_grouping text NOT NULL DEFAULT 'PAYOUT_WEEK';

ALTER TABLE public.host_settings
  DROP CONSTRAINT IF EXISTS host_settings_expense_grouping_check;

ALTER TABLE public.host_settings
  ADD CONSTRAINT host_settings_expense_grouping_check
  CHECK (expense_grouping IN ('MONTHLY', 'PAYOUT_WEEK'));

COMMENT ON COLUMN public.host_settings.payout_shortcut_enabled IS 'Whether the host auto-runs the weekly payout shortcut.';
COMMENT ON COLUMN public.host_settings.payout_run_time IS 'Host local time when the payout shortcut should run.';
COMMENT ON COLUMN public.host_settings.payout_run_timezone IS 'Timezone used to evaluate the payout shortcut schedule.';
COMMENT ON COLUMN public.host_settings.expense_grouping IS 'How expenses are grouped in the UI: MONTHLY or PAYOUT_WEEK.';
