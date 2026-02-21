
-- Parent table for grouped shopping submissions
CREATE TABLE public.shopping_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by_user_id uuid NOT NULL,
  org_id uuid REFERENCES public.organizations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'PENDING',
  notes text
);

ALTER TABLE public.shopping_submissions ENABLE ROW LEVEL SECURITY;

-- RLS: org users can view
CREATE POLICY "Org users can view shopping submissions"
ON public.shopping_submissions FOR SELECT TO authenticated
USING (org_id = get_user_org_id(auth.uid()));

-- RLS: users can insert own
CREATE POLICY "Users can create shopping submissions"
ON public.shopping_submissions FOR INSERT TO authenticated
WITH CHECK (org_id = get_user_org_id(auth.uid()) AND created_by_user_id = auth.uid());

-- RLS: admins can update
CREATE POLICY "Admins can update shopping submissions"
ON public.shopping_submissions FOR UPDATE TO authenticated
USING (org_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')));

-- RLS: admins can delete
CREATE POLICY "Admins can delete shopping submissions"
ON public.shopping_submissions FOR DELETE TO authenticated
USING (org_id = get_user_org_id(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')));

-- Add submission_id FK to shopping_list
ALTER TABLE public.shopping_list ADD COLUMN submission_id uuid REFERENCES public.shopping_submissions(id) ON DELETE CASCADE;
