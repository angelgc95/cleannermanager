DELETE FROM public.host_settings hs
WHERE NOT EXISTS (
  SELECT 1
  FROM public.user_roles ur
  WHERE ur.user_id = hs.host_user_id
    AND ur.role = 'host'::public.app_role
);
