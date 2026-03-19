-- The app only supports one primary role per user. Clean up any mixed-role users
-- before enforcing the constraint at the database layer.
WITH duplicated_users AS (
  SELECT user_id
  FROM public.user_roles
  GROUP BY user_id
  HAVING COUNT(*) > 1
),
preferred_roles AS (
  SELECT
    du.user_id,
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.host_cleaners hc
        WHERE hc.cleaner_user_id = du.user_id
      ) OR EXISTS (
        SELECT 1
        FROM public.cleaner_assignments ca
        WHERE ca.cleaner_user_id = du.user_id
      )
      THEN 'cleaner'::public.app_role
      ELSE 'host'::public.app_role
    END AS keep_role
  FROM duplicated_users du
)
DELETE FROM public.user_roles ur
USING preferred_roles pr
WHERE ur.user_id = pr.user_id
  AND ur.role <> pr.keep_role;

DELETE FROM public.host_settings hs
WHERE hs.host_user_id IN (
  SELECT pr.user_id
  FROM (
    SELECT
      du.user_id,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM public.host_cleaners hc
          WHERE hc.cleaner_user_id = du.user_id
        ) OR EXISTS (
          SELECT 1
          FROM public.cleaner_assignments ca
          WHERE ca.cleaner_user_id = du.user_id
        )
        THEN 'cleaner'::public.app_role
        ELSE 'host'::public.app_role
      END AS keep_role
    FROM (
      SELECT user_id
      FROM public.user_roles
      GROUP BY user_id
      HAVING COUNT(*) > 1
    ) du
  ) pr
  WHERE pr.keep_role = 'cleaner'::public.app_role
)
AND NOT EXISTS (
  SELECT 1
  FROM public.listings l
  WHERE l.host_user_id = hs.host_user_id
)
AND NOT EXISTS (
  SELECT 1
  FROM public.checklist_templates ct
  WHERE ct.host_user_id = hs.host_user_id
);

ALTER TABLE public.user_roles
DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;

ALTER TABLE public.user_roles
ADD CONSTRAINT user_roles_user_id_key UNIQUE (user_id);
