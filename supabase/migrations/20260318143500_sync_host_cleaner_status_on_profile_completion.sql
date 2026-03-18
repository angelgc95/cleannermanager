CREATE OR REPLACE FUNCTION public.sync_host_cleaner_status_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.setup_completed IS TRUE AND COALESCE(OLD.setup_completed, false) IS DISTINCT FROM TRUE THEN
    UPDATE public.host_cleaners
    SET status = 'ACTIVE'
    WHERE cleaner_user_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_host_cleaner_status_from_profile ON public.profiles;
CREATE TRIGGER trg_sync_host_cleaner_status_from_profile
AFTER UPDATE OF setup_completed ON public.profiles
FOR EACH ROW
WHEN (NEW.setup_completed IS TRUE)
EXECUTE FUNCTION public.sync_host_cleaner_status_from_profile();

UPDATE public.host_cleaners AS hc
SET status = 'ACTIVE'
FROM public.profiles AS p
WHERE p.user_id = hc.cleaner_user_id
  AND p.setup_completed IS TRUE
  AND hc.status <> 'ACTIVE';
