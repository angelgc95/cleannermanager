
-- =============================================================
-- MIGRATION 1: Organizations, org_id columns, constraints, payout tracking
-- =============================================================

-- 1) Create organizations table
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  invite_code text NOT NULL UNIQUE DEFAULT substr(md5(random()::text), 1, 8),
  timezone text NOT NULL DEFAULT 'Europe/London',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- 2) Add org_id to ALL business tables
ALTER TABLE public.profiles ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.properties ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.rooms ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.bookings ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.cleaning_tasks ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.checklist_templates ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.checklist_sections ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.checklist_items ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.checklist_runs ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.checklist_responses ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.checklist_photos ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.log_hours ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.expenses ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.maintenance_tickets ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.maintenance_updates ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.products ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.shopping_list ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.guides_folders ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.guides ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.payout_periods ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.payouts ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.notification_jobs ADD COLUMN org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.in_app_notifications ADD COLUMN org_id uuid REFERENCES public.organizations(id);

-- 3) Security definer function for org_id lookup
CREATE OR REPLACE FUNCTION public.get_user_org_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

-- 4) Create default org and backfill
DO $$
DECLARE
  v_org_id uuid;
BEGIN
  INSERT INTO public.organizations (name, invite_code, timezone)
  VALUES ('Default Organization', 'default1', 'Europe/London')
  RETURNING id INTO v_org_id;

  UPDATE public.profiles SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.properties SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.rooms SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.bookings SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.cleaning_tasks SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.checklist_templates SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.checklist_sections SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.checklist_items SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.checklist_runs SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.checklist_responses SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.checklist_photos SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.log_hours SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.expenses SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.maintenance_tickets SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.maintenance_updates SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.products SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.shopping_list SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.guides_folders SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.guides SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.payout_periods SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.payouts SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.notification_jobs SET org_id = v_org_id WHERE org_id IS NULL;
  UPDATE public.in_app_notifications SET org_id = v_org_id WHERE org_id IS NULL;
END $$;

-- 5) Add payout_id FK
ALTER TABLE public.log_hours ADD COLUMN payout_id uuid REFERENCES public.payouts(id);
ALTER TABLE public.checklist_runs ADD COLUMN payout_id uuid REFERENCES public.payouts(id);

-- 6) Unique constraint: one finished run per cleaning_task
CREATE UNIQUE INDEX idx_checklist_runs_cleaning_task 
ON public.checklist_runs (cleaning_task_id) 
WHERE cleaning_task_id IS NOT NULL AND finished_at IS NOT NULL;

-- 7) RLS for organizations table
CREATE POLICY "Users can view own org"
ON public.organizations FOR SELECT
USING (id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Admins can update own org"
ON public.organizations FOR UPDATE
USING (id = public.get_user_org_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager')));

-- 8) Performance indexes
CREATE INDEX idx_profiles_org_id ON public.profiles(org_id);
CREATE INDEX idx_properties_org_id ON public.properties(org_id);
CREATE INDEX idx_cleaning_tasks_org_id ON public.cleaning_tasks(org_id);
CREATE INDEX idx_bookings_org_id ON public.bookings(org_id);
CREATE INDEX idx_log_hours_org_id ON public.log_hours(org_id);
CREATE INDEX idx_log_hours_payout_id ON public.log_hours(payout_id);
CREATE INDEX idx_checklist_runs_payout_id ON public.checklist_runs(payout_id);
