DELETE FROM public.host_cleaners a
USING public.host_cleaners b
WHERE a.cleaner_user_id = b.cleaner_user_id
  AND (
    a.created_at > b.created_at
    OR (a.created_at = b.created_at AND a.id > b.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS host_cleaners_cleaner_user_id_key
ON public.host_cleaners (cleaner_user_id);
