-- Phase 3 Ops: Automations engine, Ops Inbox, QA workflow, performance indexes

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'v1_rule_trigger_type') THEN
    CREATE TYPE public.v1_rule_trigger_type AS ENUM (
      'EVENT_CREATED',
      'EVENT_STARTING_SOON',
      'EVENT_OVERDUE_START',
      'CHECKLIST_SUBMITTED',
      'CHECKLIST_FAILED',
      'SUPPLIES_LOW',
      'BOOKING_CANCELLED'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'v1_rule_run_status') THEN
    CREATE TYPE public.v1_rule_run_status AS ENUM ('SUCCESS', 'FAILED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'v1_exception_type') THEN
    CREATE TYPE public.v1_exception_type AS ENUM (
      'LATE_START',
      'MISSING_CHECKLIST',
      'QA_REVIEW_REQUIRED',
      'CHECKLIST_FAILED',
      'SUPPLIES_LOW',
      'CANCELLATION_DRIFT'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'v1_exception_severity') THEN
    CREATE TYPE public.v1_exception_severity AS ENUM ('LOW', 'MEDIUM', 'HIGH');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'v1_exception_status') THEN
    CREATE TYPE public.v1_exception_status AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'v1_qa_status') THEN
    CREATE TYPE public.v1_qa_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.v1_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.v1_organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  trigger_type public.v1_rule_trigger_type NOT NULL,
  scope_unit_id uuid NULL REFERENCES public.v1_org_units(id) ON DELETE SET NULL,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.v1_rule_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.v1_organizations(id) ON DELETE CASCADE,
  rule_id uuid NOT NULL REFERENCES public.v1_rules(id) ON DELETE CASCADE,
  event_id uuid NULL REFERENCES public.v1_events(id) ON DELETE SET NULL,
  run_id uuid NULL REFERENCES public.v1_checklist_runs(id) ON DELETE SET NULL,
  status public.v1_rule_run_status NOT NULL,
  error text NULL,
  executed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.v1_event_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.v1_organizations(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.v1_events(id) ON DELETE CASCADE,
  type public.v1_exception_type NOT NULL,
  severity public.v1_exception_severity NOT NULL DEFAULT 'MEDIUM',
  status public.v1_exception_status NOT NULL DEFAULT 'OPEN',
  assigned_to_user_id uuid NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL
);

CREATE TABLE IF NOT EXISTS public.v1_qa_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.v1_organizations(id) ON DELETE CASCADE,
  run_id uuid NOT NULL UNIQUE REFERENCES public.v1_checklist_runs(id) ON DELETE CASCADE,
  status public.v1_qa_status NOT NULL DEFAULT 'PENDING',
  reviewer_id uuid NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz NULL
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS v1_events_org_start_idx
  ON public.v1_events(organization_id, start_at);

CREATE INDEX IF NOT EXISTS v1_events_org_cleaner_start_idx
  ON public.v1_events(organization_id, assigned_cleaner_id, start_at);

CREATE INDEX IF NOT EXISTS v1_exceptions_org_status_severity_created_idx
  ON public.v1_event_exceptions(organization_id, status, severity, created_at DESC);

CREATE INDEX IF NOT EXISTS v1_rule_runs_org_executed_idx
  ON public.v1_rule_runs(organization_id, executed_at DESC);

CREATE INDEX IF NOT EXISTS v1_qa_reviews_org_status_idx
  ON public.v1_qa_reviews(organization_id, status, created_at DESC);

-- Unit-scope matching helper (rule scope on unit tree)
CREATE OR REPLACE FUNCTION public.v1_unit_in_scope(_target_unit_id uuid, _scope_unit_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE ancestors AS (
    SELECT id, parent_id
    FROM public.v1_org_units
    WHERE id = _target_unit_id
    UNION ALL
    SELECT u.id, u.parent_id
    FROM public.v1_org_units u
    JOIN ancestors a ON a.parent_id = u.id
  )
  SELECT EXISTS (
    SELECT 1
    FROM ancestors
    WHERE id = _scope_unit_id
  );
$$;

CREATE OR REPLACE FUNCTION public.v1_can_read_exception(_exception_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.v1_event_exceptions ex
    JOIN public.v1_events e ON e.id = ex.event_id
    WHERE ex.id = _exception_id
      AND (
        public.v1_has_listing_role(ex.organization_id, e.listing_id, ARRAY['OWNER','ORG_ADMIN','MANAGER','QA']::public.v1_role[])
        OR e.assigned_cleaner_id = auth.uid()
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.v1_can_update_exception(_exception_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.v1_event_exceptions ex
    JOIN public.v1_events e ON e.id = ex.event_id
    WHERE ex.id = _exception_id
      AND public.v1_has_listing_role(ex.organization_id, e.listing_id, ARRAY['MANAGER','QA']::public.v1_role[])
  );
$$;

CREATE OR REPLACE FUNCTION public.v1_can_read_qa_review(_run_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.v1_checklist_runs r
    JOIN public.v1_events e ON e.id = r.event_id
    WHERE r.id = _run_id
      AND (
        public.v1_has_listing_role(r.organization_id, e.listing_id, ARRAY['OWNER','ORG_ADMIN','MANAGER','QA']::public.v1_role[])
        OR e.assigned_cleaner_id = auth.uid()
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.v1_can_decide_qa_review(_run_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.v1_checklist_runs r
    JOIN public.v1_events e ON e.id = r.event_id
    WHERE r.id = _run_id
      AND public.v1_has_listing_role(r.organization_id, e.listing_id, ARRAY['MANAGER','QA']::public.v1_role[])
  );
$$;

-- Enable RLS
ALTER TABLE public.v1_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v1_rule_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v1_event_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v1_qa_reviews ENABLE ROW LEVEL SECURITY;

-- Rules policies
DROP POLICY IF EXISTS v1_rules_select ON public.v1_rules;
CREATE POLICY v1_rules_select ON public.v1_rules FOR SELECT
USING (public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER','QA']::public.v1_role[]));

DROP POLICY IF EXISTS v1_rules_write ON public.v1_rules;
CREATE POLICY v1_rules_write ON public.v1_rules FOR ALL
USING (public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[]))
WITH CHECK (public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[]));

-- Rule runs policies (audit read-only for console roles)
DROP POLICY IF EXISTS v1_rule_runs_select ON public.v1_rule_runs;
CREATE POLICY v1_rule_runs_select ON public.v1_rule_runs FOR SELECT
USING (public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER','QA']::public.v1_role[]));

-- Exceptions policies
DROP POLICY IF EXISTS v1_exceptions_select ON public.v1_event_exceptions;
CREATE POLICY v1_exceptions_select ON public.v1_event_exceptions FOR SELECT
USING (public.v1_can_read_exception(id));

DROP POLICY IF EXISTS v1_exceptions_insert ON public.v1_event_exceptions;
CREATE POLICY v1_exceptions_insert ON public.v1_event_exceptions FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.v1_events e
    WHERE e.id = event_id
      AND e.organization_id = organization_id
      AND (
        public.v1_has_listing_role(organization_id, e.listing_id, ARRAY['MANAGER','QA']::public.v1_role[])
        OR (e.assigned_cleaner_id = auth.uid() AND type = 'SUPPLIES_LOW')
      )
  )
);

DROP POLICY IF EXISTS v1_exceptions_update ON public.v1_event_exceptions;
CREATE POLICY v1_exceptions_update ON public.v1_event_exceptions FOR UPDATE
USING (public.v1_can_update_exception(id))
WITH CHECK (public.v1_can_update_exception(id));

-- QA reviews policies
DROP POLICY IF EXISTS v1_qa_reviews_select ON public.v1_qa_reviews;
CREATE POLICY v1_qa_reviews_select ON public.v1_qa_reviews FOR SELECT
USING (public.v1_can_read_qa_review(run_id));

DROP POLICY IF EXISTS v1_qa_reviews_insert ON public.v1_qa_reviews;
CREATE POLICY v1_qa_reviews_insert ON public.v1_qa_reviews FOR INSERT
WITH CHECK (public.v1_can_decide_qa_review(run_id));

DROP POLICY IF EXISTS v1_qa_reviews_update ON public.v1_qa_reviews;
CREATE POLICY v1_qa_reviews_update ON public.v1_qa_reviews FOR UPDATE
USING (public.v1_can_decide_qa_review(run_id))
WITH CHECK (public.v1_can_decide_qa_review(run_id));
