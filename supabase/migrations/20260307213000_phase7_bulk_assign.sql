DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'v1_assignment_batch_mode') THEN
    CREATE TYPE public.v1_assignment_batch_mode AS ENUM ('ADD', 'REPLACE', 'REMOVE');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'v1_assignment_batch_action') THEN
    CREATE TYPE public.v1_assignment_batch_action AS ENUM ('ASSIGNED', 'UNASSIGNED', 'SKIPPED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.v1_assignment_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.v1_organizations(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL,
  unit_id uuid NOT NULL REFERENCES public.v1_org_units(id) ON DELETE RESTRICT,
  mode public.v1_assignment_batch_mode NOT NULL,
  cleaner_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  listing_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.v1_assignment_batch_items (
  batch_id uuid NOT NULL REFERENCES public.v1_assignment_batches(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.v1_listings(id) ON DELETE CASCADE,
  action public.v1_assignment_batch_action NOT NULL,
  notes text NULL,
  PRIMARY KEY (batch_id, listing_id)
);

CREATE INDEX IF NOT EXISTS v1_assignment_batches_org_created_idx
  ON public.v1_assignment_batches(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS v1_assignment_batch_items_listing_idx
  ON public.v1_assignment_batch_items(listing_id);

CREATE OR REPLACE FUNCTION public.v1_can_manage_unit_scope(_organization_id uuid, _unit_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.v1_has_role(_organization_id, ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[])
    OR EXISTS (
      SELECT 1
      FROM public.v1_role_assignments ra
      WHERE ra.organization_id = _organization_id
        AND ra.user_id = auth.uid()
        AND ra.role = ANY(ARRAY['OWNER','ORG_ADMIN','MANAGER']::public.v1_role[])
        AND (
          ra.scope_type = 'ORG'
          OR (
            ra.scope_type = 'UNIT'
            AND ra.scope_id IS NOT NULL
            AND public.v1_unit_in_scope(_unit_id, ra.scope_id)
          )
        )
    );
$$;

ALTER TABLE public.v1_assignment_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v1_assignment_batch_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS v1_assignment_batches_select ON public.v1_assignment_batches;
CREATE POLICY v1_assignment_batches_select ON public.v1_assignment_batches FOR SELECT
USING (public.v1_can_manage_unit_scope(organization_id, unit_id));

DROP POLICY IF EXISTS v1_assignment_batches_insert ON public.v1_assignment_batches;
CREATE POLICY v1_assignment_batches_insert ON public.v1_assignment_batches FOR INSERT
WITH CHECK (
  actor_user_id = auth.uid()
  AND public.v1_can_manage_unit_scope(organization_id, unit_id)
);

DROP POLICY IF EXISTS v1_assignment_batch_items_select ON public.v1_assignment_batch_items;
CREATE POLICY v1_assignment_batch_items_select ON public.v1_assignment_batch_items FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.v1_assignment_batches b
    WHERE b.id = batch_id
      AND public.v1_can_manage_unit_scope(b.organization_id, b.unit_id)
  )
);

DROP POLICY IF EXISTS v1_assignment_batch_items_insert ON public.v1_assignment_batch_items;
CREATE POLICY v1_assignment_batch_items_insert ON public.v1_assignment_batch_items FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.v1_assignment_batches b
    WHERE b.id = batch_id
      AND b.actor_user_id = auth.uid()
      AND public.v1_can_manage_unit_scope(b.organization_id, b.unit_id)
  )
);
