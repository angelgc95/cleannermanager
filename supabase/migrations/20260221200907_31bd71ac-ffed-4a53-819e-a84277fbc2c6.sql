-- Allow admins/managers to insert log_hours for cleaners in their org
CREATE POLICY "Admins can insert log hours"
ON public.log_hours FOR INSERT TO authenticated
WITH CHECK (
  org_id = get_user_org_id(auth.uid())
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
);