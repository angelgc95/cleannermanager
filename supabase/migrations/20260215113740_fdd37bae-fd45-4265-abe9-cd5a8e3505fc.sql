
-- Fix: in_app_notifications INSERT should only be from service role or admin
DROP POLICY "System can insert in-app notifications" ON public.in_app_notifications;

-- Allow admins/managers to insert (edge function uses service role which bypasses RLS)
CREATE POLICY "Admins can insert in-app notifications" ON public.in_app_notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
