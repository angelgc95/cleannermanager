-- Drop the restrictive cleaner SELECT policy and replace with org-wide view
DROP POLICY IF EXISTS "Cleaners can view assigned tasks" ON public.cleaning_tasks;

CREATE POLICY "Cleaners can view org tasks"
ON public.cleaning_tasks
FOR SELECT
TO authenticated
USING (org_id = get_user_org_id(auth.uid()));
