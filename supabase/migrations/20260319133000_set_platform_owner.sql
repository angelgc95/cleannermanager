DO $$
DECLARE
  owner_user_id uuid;
BEGIN
  SELECT p.user_id
  INTO owner_user_id
  FROM public.profiles p
  WHERE lower(p.email) = 'angelandres95@gmail.com'
  ORDER BY p.created_at ASC
  LIMIT 1;

  IF owner_user_id IS NULL THEN
    RAISE NOTICE 'No profile found for angelandres95@gmail.com. Skipping platform admin update.';
    RETURN;
  END IF;

  DELETE FROM public.platform_admins
  WHERE user_id <> owner_user_id;

  INSERT INTO public.platform_admins (user_id)
  VALUES (owner_user_id)
  ON CONFLICT (user_id) DO NOTHING;
END $$;
