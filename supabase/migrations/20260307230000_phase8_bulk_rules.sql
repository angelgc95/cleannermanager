DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'v1_rule_batch_mode') THEN
    CREATE TYPE public.v1_rule_batch_mode AS ENUM ('CLONE', 'SCOPE_EXISTING');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.v1_rule_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.v1_organizations(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL,
  target_unit_id uuid NOT NULL REFERENCES public.v1_org_units(id) ON DELETE RESTRICT,
  mode public.v1_rule_batch_mode NOT NULL,
  rule_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.v1_rule_batch_items (
  batch_id uuid NOT NULL REFERENCES public.v1_rule_batches(id) ON DELETE CASCADE,
  source_rule_id uuid NOT NULL REFERENCES public.v1_rules(id) ON DELETE CASCADE,
  result_rule_id uuid NULL REFERENCES public.v1_rules(id) ON DELETE SET NULL,
  action public.v1_assignment_batch_action NOT NULL,
  notes text NULL,
  PRIMARY KEY (batch_id, source_rule_id)
);

CREATE INDEX IF NOT EXISTS v1_rule_batches_org_created_idx
  ON public.v1_rule_batches(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS v1_rule_batch_items_result_idx
  ON public.v1_rule_batch_items(result_rule_id);

ALTER TABLE public.v1_rule_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.v1_rule_batch_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS v1_rule_batches_select ON public.v1_rule_batches;
CREATE POLICY v1_rule_batches_select ON public.v1_rule_batches FOR SELECT
USING (public.v1_can_manage_unit_scope(organization_id, target_unit_id));

DROP POLICY IF EXISTS v1_rule_batches_insert ON public.v1_rule_batches;
CREATE POLICY v1_rule_batches_insert ON public.v1_rule_batches FOR INSERT
WITH CHECK (
  actor_user_id = auth.uid()
  AND public.v1_can_manage_unit_scope(organization_id, target_unit_id)
);

DROP POLICY IF EXISTS v1_rule_batch_items_select ON public.v1_rule_batch_items;
CREATE POLICY v1_rule_batch_items_select ON public.v1_rule_batch_items FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.v1_rule_batches b
    WHERE b.id = batch_id
      AND public.v1_can_manage_unit_scope(b.organization_id, b.target_unit_id)
  )
);

DROP POLICY IF EXISTS v1_rule_batch_items_insert ON public.v1_rule_batch_items;
CREATE POLICY v1_rule_batch_items_insert ON public.v1_rule_batch_items FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.v1_rule_batches b
    WHERE b.id = batch_id
      AND b.actor_user_id = auth.uid()
      AND public.v1_can_manage_unit_scope(b.organization_id, b.target_unit_id)
  )
);
