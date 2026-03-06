CREATE TABLE IF NOT EXISTS public.v1_template_assignments (
  organization_id uuid NOT NULL REFERENCES public.v1_organizations(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.v1_org_units(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.v1_checklist_templates(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, unit_id)
);

CREATE INDEX IF NOT EXISTS v1_template_assignments_template_idx
  ON public.v1_template_assignments(template_id);

CREATE INDEX IF NOT EXISTS v1_template_assignments_org_updated_idx
  ON public.v1_template_assignments(organization_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.v1_template_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.v1_organizations(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL,
  unit_id uuid NOT NULL REFERENCES public.v1_org_units(id) ON DELETE RESTRICT,
  template_id uuid NOT NULL REFERENCES public.v1_checklist_templates(id) ON DELETE RESTRICT,
  include_descendants boolean NOT NULL DEFAULT true,
  listing_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.v1_template_batch_items (
  batch_id uuid NOT NULL REFERENCES public.v1_template_batches(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES public.v1_listings(id) ON DELETE CASCADE,
  action public.v1_assignment_batch_action NOT NULL,
  notes text NULL,
  PRIMARY KEY (batch_id, listing_id)
);

CREATE INDEX IF NOT EXISTS v1_template_batches_org_created_idx
  ON public.v1_template_batches(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS v1_template_batch_items_listing_idx
  ON public.v1_template_batch_items(listing_id);

CREATE OR REPLACE FUNCTION public.v1_resolve_listing_template(_listing_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  listing_org_id uuid;
  listing_unit_id uuid;
  resolved_template_id uuid;
BEGIN
  SELECT l.organization_id, l.unit_id
  INTO listing_org_id, listing_unit_id
  FROM public.v1_listings l
  WHERE l.id = _listing_id;

  IF listing_org_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT (
    public.v1_can_read_listing(listing_org_id, _listing_id)
    OR EXISTS (
      SELECT 1
      FROM public.v1_events e
      WHERE e.organization_id = listing_org_id
        AND e.listing_id = _listing_id
        AND e.assigned_cleaner_id = auth.uid()
    )
  ) THEN
    RETURN NULL;
  END IF;

  SELECT t.id
  INTO resolved_template_id
  FROM public.v1_checklist_templates t
  WHERE t.organization_id = listing_org_id
    AND t.listing_id = _listing_id
    AND t.active = true
  ORDER BY t.created_at DESC
  LIMIT 1;

  IF resolved_template_id IS NOT NULL THEN
    RETURN resolved_template_id;
  END IF;

  WITH RECURSIVE lineage AS (
    SELECT u.id, u.parent_id, 0 AS depth
    FROM public.v1_org_units u
    WHERE u.id = listing_unit_id
    UNION ALL
    SELECT parent.id, parent.parent_id, lineage.depth + 1
    FROM public.v1_org_units parent
    JOIN lineage ON lineage.parent_id = parent.id
  )
  SELECT ta.template_id
  INTO resolved_template_id
  FROM lineage
  JOIN public.v1_template_assignments ta
    ON ta.organization_id = listing_org_id
   AND ta.unit_id = lineage.id
  JOIN public.v1_checklist_templates t
    ON t.id = ta.template_id
   AND t.active = true
  ORDER BY lineage.depth ASC, ta.updated_at DESC, ta.created_at DESC
  LIMIT 1;

  RETURN resolved_template_id;
END;
$$;

ALTER TABLE public.v1_template_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v1_template_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v1_template_batch_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS v1_template_assignments_select ON public.v1_template_assignments;
CREATE POLICY v1_template_assignments_select ON public.v1_template_assignments FOR SELECT
USING (public.v1_can_manage_unit_scope(organization_id, unit_id));

DROP POLICY IF EXISTS v1_template_assignments_write ON public.v1_template_assignments;
CREATE POLICY v1_template_assignments_write ON public.v1_template_assignments FOR ALL
USING (public.v1_can_manage_unit_scope(organization_id, unit_id))
WITH CHECK (public.v1_can_manage_unit_scope(organization_id, unit_id));

DROP POLICY IF EXISTS v1_template_batches_select ON public.v1_template_batches;
CREATE POLICY v1_template_batches_select ON public.v1_template_batches FOR SELECT
USING (public.v1_can_manage_unit_scope(organization_id, unit_id));

DROP POLICY IF EXISTS v1_template_batches_insert ON public.v1_template_batches;
CREATE POLICY v1_template_batches_insert ON public.v1_template_batches FOR INSERT
WITH CHECK (
  actor_user_id = auth.uid()
  AND public.v1_can_manage_unit_scope(organization_id, unit_id)
);

DROP POLICY IF EXISTS v1_template_batch_items_select ON public.v1_template_batch_items;
CREATE POLICY v1_template_batch_items_select ON public.v1_template_batch_items FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.v1_template_batches b
    WHERE b.id = batch_id
      AND public.v1_can_manage_unit_scope(b.organization_id, b.unit_id)
  )
);

DROP POLICY IF EXISTS v1_template_batch_items_insert ON public.v1_template_batch_items;
CREATE POLICY v1_template_batch_items_insert ON public.v1_template_batch_items FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.v1_template_batches b
    WHERE b.id = batch_id
      AND b.actor_user_id = auth.uid()
      AND public.v1_can_manage_unit_scope(b.organization_id, b.unit_id)
  )
);
