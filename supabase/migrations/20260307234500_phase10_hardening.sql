DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'v1_system_log_level') THEN
    CREATE TYPE public.v1_system_log_level AS ENUM ('INFO', 'WARN', 'ERROR');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.v1_unit_weekly_stats (
  organization_id uuid NOT NULL REFERENCES public.v1_organizations(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.v1_org_units(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, unit_id, week_start)
);

CREATE TABLE IF NOT EXISTS public.v1_rate_limits (
  organization_id uuid NOT NULL REFERENCES public.v1_organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  action text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id, action, window_start)
);

CREATE TABLE IF NOT EXISTS public.v1_system_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NULL REFERENCES public.v1_organizations(id) ON DELETE CASCADE,
  source text NOT NULL,
  level public.v1_system_log_level NOT NULL DEFAULT 'INFO',
  message text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS v1_unit_weekly_stats_org_week_idx
  ON public.v1_unit_weekly_stats(organization_id, week_start DESC);

CREATE INDEX IF NOT EXISTS v1_rate_limits_updated_idx
  ON public.v1_rate_limits(updated_at DESC);

CREATE INDEX IF NOT EXISTS v1_system_logs_org_created_idx
  ON public.v1_system_logs(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS v1_system_logs_source_level_idx
  ON public.v1_system_logs(source, level, created_at DESC);

ALTER TABLE public.v1_unit_weekly_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v1_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v1_system_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS v1_unit_weekly_stats_select ON public.v1_unit_weekly_stats;
CREATE POLICY v1_unit_weekly_stats_select ON public.v1_unit_weekly_stats FOR SELECT
USING (public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER','QA']::public.v1_role[]));

DROP POLICY IF EXISTS v1_system_logs_select ON public.v1_system_logs;
CREATE POLICY v1_system_logs_select ON public.v1_system_logs FOR SELECT
USING (
  organization_id IS NULL
  OR public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER','QA']::public.v1_role[])
);
