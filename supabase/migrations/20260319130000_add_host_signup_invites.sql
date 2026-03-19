DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typnamespace = 'public'::regnamespace
      AND typname = 'host_signup_invite_status'
  ) THEN
    CREATE TYPE public.host_signup_invite_status AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Platform admins can view own admin row" ON public.platform_admins;
CREATE POLICY "Platform admins can view own admin row"
ON public.platform_admins
FOR SELECT
USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins
    WHERE user_id = _user_id
  );
$$;

CREATE TABLE IF NOT EXISTS public.host_signup_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  invited_by_user_id uuid NOT NULL,
  status public.host_signup_invite_status NOT NULL DEFAULT 'PENDING',
  accepted_by_user_id uuid,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.host_signup_invites ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_host_signup_invites_updated_at ON public.host_signup_invites;
CREATE TRIGGER update_host_signup_invites_updated_at
BEFORE UPDATE ON public.host_signup_invites
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.platform_admins (user_id)
SELECT hs.host_user_id
FROM public.host_settings hs
WHERE NOT EXISTS (SELECT 1 FROM public.platform_admins)
ORDER BY hs.created_at ASC
LIMIT 1
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO public.platform_admins (user_id)
SELECT ur.user_id
FROM public.user_roles ur
JOIN public.profiles p
  ON p.user_id = ur.user_id
WHERE ur.role = 'host'::public.app_role
  AND NOT EXISTS (SELECT 1 FROM public.platform_admins)
ORDER BY p.created_at ASC
LIMIT 1
ON CONFLICT (user_id) DO NOTHING;
