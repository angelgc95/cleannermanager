-- Foundation V1: Organization-first SaaS schema, RBAC, RLS, storage isolation

create extension if not exists pgcrypto;

-- Enums
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'v1_billing_tier') THEN
    CREATE TYPE public.v1_billing_tier AS ENUM ('FREE', 'PRO', 'ENTERPRISE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'v1_unit_type') THEN
    CREATE TYPE public.v1_unit_type AS ENUM ('ORG_ROOT', 'COUNTRY', 'CITY', 'BUILDING');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'v1_role') THEN
    CREATE TYPE public.v1_role AS ENUM ('OWNER', 'ORG_ADMIN', 'MANAGER', 'QA', 'CLEANER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'v1_scope_type') THEN
    CREATE TYPE public.v1_scope_type AS ENUM ('ORG', 'UNIT', 'LISTING');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'v1_booking_status') THEN
    CREATE TYPE public.v1_booking_status AS ENUM ('CONFIRMED', 'CANCELLED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'v1_event_status') THEN
    CREATE TYPE public.v1_event_status AS ENUM ('TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'v1_checklist_run_status') THEN
    CREATE TYPE public.v1_checklist_run_status AS ENUM ('IN_PROGRESS', 'COMPLETED', 'QA_REVIEW');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'v1_item_type') THEN
    CREATE TYPE public.v1_item_type AS ENUM ('YES_NO', 'TEXT', 'NUMBER', 'PHOTO');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'v1_payout_frequency') THEN
    CREATE TYPE public.v1_payout_frequency AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');
  END IF;
END $$;

-- Core tenant model
CREATE TABLE IF NOT EXISTS public.v1_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  billing_tier public.v1_billing_tier NOT NULL DEFAULT 'FREE',
  listing_limit integer NOT NULL DEFAULT 3,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.v1_org_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.v1_organizations(id) ON DELETE CASCADE,
  type public.v1_unit_type NOT NULL,
  parent_id uuid NULL REFERENCES public.v1_org_units(id) ON DELETE SET NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS v1_org_root_per_org_idx
  ON public.v1_org_units(organization_id)
  WHERE type = 'ORG_ROOT';

CREATE TABLE IF NOT EXISTS public.v1_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.v1_organizations(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.v1_org_units(id) ON DELETE RESTRICT,
  name text NOT NULL,
  ical_url text NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.v1_organization_members (
  organization_id uuid NOT NULL REFERENCES public.v1_organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.v1_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.v1_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.v1_organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.v1_role NOT NULL,
  scope_type public.v1_scope_type NOT NULL,
  scope_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS v1_role_assignment_unique_idx
  ON public.v1_role_assignments(organization_id, user_id, role, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE TABLE IF NOT EXISTS public.v1_listing_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.v1_organizations(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.v1_listings(id) ON DELETE CASCADE,
  cleaner_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS v1_listing_assignment_active_unique_idx
  ON public.v1_listing_assignments(listing_id, cleaner_id)
  WHERE active = true;

-- Bookings/events
CREATE TABLE IF NOT EXISTS public.v1_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.v1_organizations(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.v1_listings(id) ON DELETE CASCADE,
  ical_uid text NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status public.v1_booking_status NOT NULL DEFAULT 'CONFIRMED',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, listing_id, ical_uid)
);

CREATE TABLE IF NOT EXISTS public.v1_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.v1_organizations(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.v1_listings(id) ON DELETE CASCADE,
  booking_id uuid NULL UNIQUE REFERENCES public.v1_bookings(id) ON DELETE SET NULL,
  assigned_cleaner_id uuid NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status public.v1_event_status NOT NULL DEFAULT 'TODO',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Checklist
CREATE TABLE IF NOT EXISTS public.v1_checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.v1_organizations(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.v1_listings(id) ON DELETE CASCADE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.v1_checklist_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.v1_checklist_templates(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.v1_organizations(id) ON DELETE CASCADE,
  label text NOT NULL,
  item_type public.v1_item_type NOT NULL DEFAULT 'YES_NO',
  required boolean NOT NULL DEFAULT true,
  photo_required boolean NOT NULL DEFAULT false,
  fail_requires_comment boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.v1_checklist_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.v1_organizations(id) ON DELETE CASCADE,
  event_id uuid NOT NULL UNIQUE REFERENCES public.v1_events(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.v1_checklist_templates(id) ON DELETE RESTRICT,
  cleaner_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL,
  status public.v1_checklist_run_status NOT NULL DEFAULT 'IN_PROGRESS',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.v1_checklist_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.v1_organizations(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.v1_checklist_runs(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.v1_checklist_template_items(id) ON DELETE CASCADE,
  passed boolean NULL,
  text_value text NULL,
  number_value numeric NULL,
  comment text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, item_id)
);

CREATE TABLE IF NOT EXISTS public.v1_checklist_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.v1_organizations(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.v1_checklist_runs(id) ON DELETE CASCADE,
  item_id uuid NULL REFERENCES public.v1_checklist_template_items(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Manual/checklist-linked entities
CREATE TABLE IF NOT EXISTS public.v1_hours_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.v1_organizations(id) ON DELETE CASCADE,
  cleaner_id uuid NOT NULL,
  event_id uuid NULL REFERENCES public.v1_events(id) ON DELETE SET NULL,
  run_id uuid NULL REFERENCES public.v1_checklist_runs(id) ON DELETE SET NULL,
  minutes integer NOT NULL CHECK (minutes >= 0),
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.v1_shopping_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.v1_organizations(id) ON DELETE CASCADE,
  cleaner_id uuid NOT NULL,
  event_id uuid NULL REFERENCES public.v1_events(id) ON DELETE SET NULL,
  run_id uuid NULL REFERENCES public.v1_checklist_runs(id) ON DELETE SET NULL,
  item text NOT NULL,
  qty numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.v1_maintenance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.v1_organizations(id) ON DELETE CASCADE,
  cleaner_id uuid NOT NULL,
  event_id uuid NULL REFERENCES public.v1_events(id) ON DELETE SET NULL,
  run_id uuid NULL REFERENCES public.v1_checklist_runs(id) ON DELETE SET NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.v1_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.v1_organizations(id) ON DELETE CASCADE,
  event_id uuid NULL REFERENCES public.v1_events(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  category text NULL,
  note text NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Payouts
CREATE TABLE IF NOT EXISTS public.v1_payout_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.v1_organizations(id) ON DELETE CASCADE,
  frequency public.v1_payout_frequency NOT NULL DEFAULT 'WEEKLY',
  rate_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.v1_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.v1_organizations(id) ON DELETE CASCADE,
  cleaner_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_minutes integer NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Guides
CREATE TABLE IF NOT EXISTS public.v1_guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.v1_organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Auto-create ORG_ROOT per organization
CREATE OR REPLACE FUNCTION public.v1_create_org_root()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.v1_org_units (organization_id, type, parent_id, name)
  VALUES (NEW.id, 'ORG_ROOT', NULL, NEW.name || ' Root')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS v1_org_root_after_insert ON public.v1_organizations;
CREATE TRIGGER v1_org_root_after_insert
AFTER INSERT ON public.v1_organizations
FOR EACH ROW EXECUTE FUNCTION public.v1_create_org_root();

-- RBAC helper functions
CREATE OR REPLACE FUNCTION public.v1_is_member(_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.v1_organization_members m
    WHERE m.organization_id = _organization_id
      AND m.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.v1_has_role(_organization_id uuid, _roles public.v1_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.v1_organization_members m
    WHERE m.organization_id = _organization_id
      AND m.user_id = auth.uid()
      AND m.role = ANY(_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.v1_has_unit_role(_organization_id uuid, _unit_id uuid, _roles public.v1_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.v1_role_assignments ra
    WHERE ra.organization_id = _organization_id
      AND ra.user_id = auth.uid()
      AND ra.role = ANY(_roles)
      AND (
        ra.scope_type = 'ORG'
        OR (ra.scope_type = 'UNIT' AND ra.scope_id = _unit_id)
      )
  )
  OR public.v1_has_role(_organization_id, _roles);
$$;

CREATE OR REPLACE FUNCTION public.v1_has_listing_role(_organization_id uuid, _listing_id uuid, _roles public.v1_role[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.v1_role_assignments ra
    JOIN public.v1_listings l ON l.id = _listing_id
    WHERE ra.organization_id = _organization_id
      AND ra.user_id = auth.uid()
      AND ra.role = ANY(_roles)
      AND (
        ra.scope_type = 'ORG'
        OR (ra.scope_type = 'LISTING' AND ra.scope_id = _listing_id)
        OR (ra.scope_type = 'UNIT' AND ra.scope_id = l.unit_id)
      )
  )
  OR public.v1_has_role(_organization_id, _roles);
$$;

CREATE OR REPLACE FUNCTION public.v1_has_listing_assignment(_organization_id uuid, _listing_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.v1_listing_assignments la
    WHERE la.organization_id = _organization_id
      AND la.listing_id = _listing_id
      AND la.cleaner_id = auth.uid()
      AND la.active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.v1_can_read_listing(_organization_id uuid, _listing_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.v1_has_listing_role(_organization_id, _listing_id, ARRAY['OWNER','ORG_ADMIN','MANAGER','QA']::public.v1_role[])
      OR public.v1_has_listing_assignment(_organization_id, _listing_id);
$$;

CREATE OR REPLACE FUNCTION public.v1_can_access_run(_organization_id uuid, _run_id uuid)
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
      AND r.organization_id = _organization_id
      AND (
        public.v1_has_listing_role(_organization_id, e.listing_id, ARRAY['OWNER','ORG_ADMIN','MANAGER','QA']::public.v1_role[])
        OR r.cleaner_id = auth.uid()
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.v1_cleaner_can_use_org(_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.v1_has_role(_organization_id, ARRAY['CLEANER']::public.v1_role[])
      OR EXISTS (
        SELECT 1
        FROM public.v1_listing_assignments la
        WHERE la.organization_id = _organization_id
          AND la.cleaner_id = auth.uid()
          AND la.active = true
      );
$$;

CREATE OR REPLACE FUNCTION public.v1_can_access_photo_object(object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_text text;
  run_text text;
  org_id uuid;
  run_id uuid;
BEGIN
  IF split_part(object_name, '/', 1) <> 'org' OR split_part(object_name, '/', 3) <> 'run' THEN
    RETURN false;
  END IF;

  org_text := split_part(object_name, '/', 2);
  run_text := split_part(object_name, '/', 4);

  BEGIN
    org_id := org_text::uuid;
    run_id := run_text::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  RETURN public.v1_can_access_run(org_id, run_id);
END;
$$;

-- Enable RLS
ALTER TABLE public.v1_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v1_org_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v1_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v1_organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v1_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v1_listing_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v1_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v1_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v1_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v1_checklist_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v1_checklist_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v1_checklist_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v1_checklist_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v1_hours_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v1_shopping_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v1_maintenance_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v1_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v1_payout_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v1_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v1_guides ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS v1_org_select ON public.v1_organizations;
CREATE POLICY v1_org_select ON public.v1_organizations FOR SELECT
USING (public.v1_is_member(id));

DROP POLICY IF EXISTS v1_org_update ON public.v1_organizations;
CREATE POLICY v1_org_update ON public.v1_organizations FOR UPDATE
USING (public.v1_has_role(id, ARRAY['OWNER','ORG_ADMIN']::public.v1_role[]))
WITH CHECK (public.v1_has_role(id, ARRAY['OWNER','ORG_ADMIN']::public.v1_role[]));

DROP POLICY IF EXISTS v1_units_select ON public.v1_org_units;
CREATE POLICY v1_units_select ON public.v1_org_units FOR SELECT
USING (public.v1_is_member(organization_id));

DROP POLICY IF EXISTS v1_units_write ON public.v1_org_units;
CREATE POLICY v1_units_write ON public.v1_org_units FOR ALL
USING (public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[]))
WITH CHECK (public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[]));

DROP POLICY IF EXISTS v1_listings_select ON public.v1_listings;
CREATE POLICY v1_listings_select ON public.v1_listings FOR SELECT
USING (public.v1_can_read_listing(organization_id, id));

DROP POLICY IF EXISTS v1_listings_write ON public.v1_listings;
CREATE POLICY v1_listings_write ON public.v1_listings FOR ALL
USING (public.v1_has_unit_role(organization_id, unit_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[]))
WITH CHECK (public.v1_has_unit_role(organization_id, unit_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[]));

DROP POLICY IF EXISTS v1_members_select ON public.v1_organization_members;
CREATE POLICY v1_members_select ON public.v1_organization_members FOR SELECT
USING (public.v1_is_member(organization_id));

DROP POLICY IF EXISTS v1_members_write ON public.v1_organization_members;
CREATE POLICY v1_members_write ON public.v1_organization_members FOR ALL
USING (public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN']::public.v1_role[]))
WITH CHECK (public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN']::public.v1_role[]));

DROP POLICY IF EXISTS v1_role_assignments_select ON public.v1_role_assignments;
CREATE POLICY v1_role_assignments_select ON public.v1_role_assignments FOR SELECT
USING (public.v1_is_member(organization_id));

DROP POLICY IF EXISTS v1_role_assignments_write ON public.v1_role_assignments;
CREATE POLICY v1_role_assignments_write ON public.v1_role_assignments FOR ALL
USING (public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[]))
WITH CHECK (public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[]));

DROP POLICY IF EXISTS v1_listing_assignments_select ON public.v1_listing_assignments;
CREATE POLICY v1_listing_assignments_select ON public.v1_listing_assignments FOR SELECT
USING (
  public.v1_can_read_listing(organization_id, listing_id)
  OR cleaner_id = auth.uid()
);

DROP POLICY IF EXISTS v1_listing_assignments_write ON public.v1_listing_assignments;
CREATE POLICY v1_listing_assignments_write ON public.v1_listing_assignments FOR ALL
USING (public.v1_has_listing_role(organization_id, listing_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[]))
WITH CHECK (public.v1_has_listing_role(organization_id, listing_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[]));

DROP POLICY IF EXISTS v1_bookings_select ON public.v1_bookings;
CREATE POLICY v1_bookings_select ON public.v1_bookings FOR SELECT
USING (public.v1_can_read_listing(organization_id, listing_id));

DROP POLICY IF EXISTS v1_bookings_write ON public.v1_bookings;
CREATE POLICY v1_bookings_write ON public.v1_bookings FOR ALL
USING (public.v1_has_listing_role(organization_id, listing_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[]))
WITH CHECK (public.v1_has_listing_role(organization_id, listing_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[]));

DROP POLICY IF EXISTS v1_events_select ON public.v1_events;
CREATE POLICY v1_events_select ON public.v1_events FOR SELECT
USING (
  public.v1_can_read_listing(organization_id, listing_id)
  OR assigned_cleaner_id = auth.uid()
);

DROP POLICY IF EXISTS v1_events_write ON public.v1_events;
CREATE POLICY v1_events_write ON public.v1_events FOR ALL
USING (
  public.v1_has_listing_role(organization_id, listing_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[])
  OR assigned_cleaner_id = auth.uid()
)
WITH CHECK (
  public.v1_has_listing_role(organization_id, listing_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[])
  OR assigned_cleaner_id = auth.uid()
);

DROP POLICY IF EXISTS v1_templates_select ON public.v1_checklist_templates;
CREATE POLICY v1_templates_select ON public.v1_checklist_templates FOR SELECT
USING (public.v1_can_read_listing(organization_id, listing_id));

DROP POLICY IF EXISTS v1_templates_write ON public.v1_checklist_templates;
CREATE POLICY v1_templates_write ON public.v1_checklist_templates FOR ALL
USING (public.v1_has_listing_role(organization_id, listing_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[]))
WITH CHECK (public.v1_has_listing_role(organization_id, listing_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[]));

DROP POLICY IF EXISTS v1_template_items_select ON public.v1_checklist_template_items;
CREATE POLICY v1_template_items_select ON public.v1_checklist_template_items FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.v1_checklist_templates t
    WHERE t.id = template_id
      AND public.v1_can_read_listing(t.organization_id, t.listing_id)
  )
);

DROP POLICY IF EXISTS v1_template_items_write ON public.v1_checklist_template_items;
CREATE POLICY v1_template_items_write ON public.v1_checklist_template_items FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.v1_checklist_templates t
    WHERE t.id = template_id
      AND public.v1_has_listing_role(t.organization_id, t.listing_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[])
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.v1_checklist_templates t
    WHERE t.id = template_id
      AND public.v1_has_listing_role(t.organization_id, t.listing_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[])
  )
);

DROP POLICY IF EXISTS v1_runs_select ON public.v1_checklist_runs;
CREATE POLICY v1_runs_select ON public.v1_checklist_runs FOR SELECT
USING (public.v1_can_access_run(organization_id, id));

DROP POLICY IF EXISTS v1_runs_write ON public.v1_checklist_runs;
CREATE POLICY v1_runs_write ON public.v1_checklist_runs FOR ALL
USING (
  public.v1_can_access_run(organization_id, id)
  OR public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[])
)
WITH CHECK (
  (
    cleaner_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.v1_events e
      WHERE e.id = event_id
        AND e.organization_id = organization_id
        AND e.assigned_cleaner_id = auth.uid()
    )
  )
  OR public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[])
);

DROP POLICY IF EXISTS v1_responses_select ON public.v1_checklist_responses;
CREATE POLICY v1_responses_select ON public.v1_checklist_responses FOR SELECT
USING (public.v1_can_access_run(organization_id, run_id));

DROP POLICY IF EXISTS v1_responses_write ON public.v1_checklist_responses;
CREATE POLICY v1_responses_write ON public.v1_checklist_responses FOR ALL
USING (public.v1_can_access_run(organization_id, run_id))
WITH CHECK (public.v1_can_access_run(organization_id, run_id));

DROP POLICY IF EXISTS v1_photos_select ON public.v1_checklist_photos;
CREATE POLICY v1_photos_select ON public.v1_checklist_photos FOR SELECT
USING (public.v1_can_access_run(organization_id, run_id));

DROP POLICY IF EXISTS v1_photos_write ON public.v1_checklist_photos;
CREATE POLICY v1_photos_write ON public.v1_checklist_photos FOR ALL
USING (public.v1_can_access_run(organization_id, run_id))
WITH CHECK (public.v1_can_access_run(organization_id, run_id));

DROP POLICY IF EXISTS v1_hours_select ON public.v1_hours_entries;
CREATE POLICY v1_hours_select ON public.v1_hours_entries FOR SELECT
USING (
  public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER','QA']::public.v1_role[])
  OR (cleaner_id = auth.uid() AND public.v1_cleaner_can_use_org(organization_id))
);

DROP POLICY IF EXISTS v1_hours_write ON public.v1_hours_entries;
CREATE POLICY v1_hours_write ON public.v1_hours_entries FOR ALL
USING (
  public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[])
  OR (cleaner_id = auth.uid() AND public.v1_cleaner_can_use_org(organization_id))
)
WITH CHECK (
  (
    cleaner_id = auth.uid()
    AND public.v1_cleaner_can_use_org(organization_id)
    AND (event_id IS NULL OR organization_id = (SELECT e.organization_id FROM public.v1_events e WHERE e.id = event_id))
  )
  OR public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[])
);

DROP POLICY IF EXISTS v1_shopping_select ON public.v1_shopping_entries;
CREATE POLICY v1_shopping_select ON public.v1_shopping_entries FOR SELECT
USING (
  public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER','QA']::public.v1_role[])
  OR (cleaner_id = auth.uid() AND public.v1_cleaner_can_use_org(organization_id))
);

DROP POLICY IF EXISTS v1_shopping_write ON public.v1_shopping_entries;
CREATE POLICY v1_shopping_write ON public.v1_shopping_entries FOR ALL
USING (
  public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[])
  OR (cleaner_id = auth.uid() AND public.v1_cleaner_can_use_org(organization_id))
)
WITH CHECK (
  (
    cleaner_id = auth.uid()
    AND public.v1_cleaner_can_use_org(organization_id)
    AND (event_id IS NULL OR organization_id = (SELECT e.organization_id FROM public.v1_events e WHERE e.id = event_id))
  )
  OR public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[])
);

DROP POLICY IF EXISTS v1_maintenance_select ON public.v1_maintenance_entries;
CREATE POLICY v1_maintenance_select ON public.v1_maintenance_entries FOR SELECT
USING (
  public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER','QA']::public.v1_role[])
  OR (cleaner_id = auth.uid() AND public.v1_cleaner_can_use_org(organization_id))
);

DROP POLICY IF EXISTS v1_maintenance_write ON public.v1_maintenance_entries;
CREATE POLICY v1_maintenance_write ON public.v1_maintenance_entries FOR ALL
USING (
  public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[])
  OR (cleaner_id = auth.uid() AND public.v1_cleaner_can_use_org(organization_id))
)
WITH CHECK (
  (
    cleaner_id = auth.uid()
    AND public.v1_cleaner_can_use_org(organization_id)
    AND (event_id IS NULL OR organization_id = (SELECT e.organization_id FROM public.v1_events e WHERE e.id = event_id))
  )
  OR public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[])
);

DROP POLICY IF EXISTS v1_expenses_select ON public.v1_expenses;
CREATE POLICY v1_expenses_select ON public.v1_expenses FOR SELECT
USING (
  public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER','QA']::public.v1_role[])
  OR (created_by = auth.uid() AND public.v1_cleaner_can_use_org(organization_id))
);

DROP POLICY IF EXISTS v1_expenses_write ON public.v1_expenses;
CREATE POLICY v1_expenses_write ON public.v1_expenses FOR ALL
USING (
  public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[])
  OR (created_by = auth.uid() AND public.v1_cleaner_can_use_org(organization_id))
)
WITH CHECK (
  (
    created_by = auth.uid()
    AND public.v1_cleaner_can_use_org(organization_id)
    AND (event_id IS NULL OR organization_id = (SELECT e.organization_id FROM public.v1_events e WHERE e.id = event_id))
  )
  OR public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[])
);

DROP POLICY IF EXISTS v1_payout_settings_select ON public.v1_payout_settings;
CREATE POLICY v1_payout_settings_select ON public.v1_payout_settings FOR SELECT
USING (public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER','QA']::public.v1_role[]));

DROP POLICY IF EXISTS v1_payout_settings_write ON public.v1_payout_settings;
CREATE POLICY v1_payout_settings_write ON public.v1_payout_settings FOR ALL
USING (public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[]))
WITH CHECK (public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[]));

DROP POLICY IF EXISTS v1_payouts_select ON public.v1_payouts;
CREATE POLICY v1_payouts_select ON public.v1_payouts FOR SELECT
USING (
  public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER','QA']::public.v1_role[])
  OR cleaner_id = auth.uid()
);

DROP POLICY IF EXISTS v1_payouts_write ON public.v1_payouts;
CREATE POLICY v1_payouts_write ON public.v1_payouts FOR ALL
USING (public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[]))
WITH CHECK (public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[]));

DROP POLICY IF EXISTS v1_guides_select ON public.v1_guides;
CREATE POLICY v1_guides_select ON public.v1_guides FOR SELECT
USING (public.v1_is_member(organization_id));

DROP POLICY IF EXISTS v1_guides_write ON public.v1_guides;
CREATE POLICY v1_guides_write ON public.v1_guides FOR ALL
USING (public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[]))
WITH CHECK (public.v1_has_role(organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[]));

-- Private storage bucket for checklist photos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'v1-checklist-photos',
  'v1-checklist-photos',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS v1_storage_select ON storage.objects;
CREATE POLICY v1_storage_select
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'v1-checklist-photos'
  AND public.v1_can_access_photo_object(name)
);

DROP POLICY IF EXISTS v1_storage_insert ON storage.objects;
CREATE POLICY v1_storage_insert
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'v1-checklist-photos'
  AND owner = auth.uid()
  AND public.v1_can_access_photo_object(name)
);

DROP POLICY IF EXISTS v1_storage_delete ON storage.objects;
CREATE POLICY v1_storage_delete
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'v1-checklist-photos'
  AND public.v1_can_access_photo_object(name)
);
