DROP POLICY IF EXISTS "Host can view assigned profiles" ON public.profiles;

CREATE POLICY "Host can view connected cleaner profiles"
ON public.profiles
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.cleaner_assignments AS ca
    WHERE ca.host_user_id = auth.uid()
      AND ca.cleaner_user_id = profiles.user_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.host_cleaners AS hc
    WHERE hc.host_user_id = auth.uid()
      AND hc.cleaner_user_id = profiles.user_id
  )
);
