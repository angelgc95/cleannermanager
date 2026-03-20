ALTER TABLE public.checklist_runs
ADD COLUMN review_status text NOT NULL DEFAULT 'PENDING'
CHECK (review_status IN ('PENDING', 'FLAGGED', 'APPROVED'));

ALTER TABLE public.checklist_runs
ADD COLUMN approved_at timestamptz;

UPDATE public.checklist_runs
SET review_status = 'PENDING'
WHERE finished_at IS NOT NULL
  AND review_status IS DISTINCT FROM 'PENDING';

CREATE OR REPLACE FUNCTION public.sync_checklist_run_review_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id uuid := COALESCE(NEW.checklist_run_id, OLD.checklist_run_id);
  v_has_open_flags boolean := false;
BEGIN
  IF v_run_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.checklist_review_flags
    WHERE checklist_run_id = v_run_id
      AND status = 'OPEN'
  ) INTO v_has_open_flags;

  IF v_has_open_flags THEN
    UPDATE public.checklist_runs
    SET review_status = 'FLAGGED',
        approved_at = NULL
    WHERE id = v_run_id;
  ELSE
    UPDATE public.checklist_runs
    SET review_status = 'PENDING',
        approved_at = NULL
    WHERE id = v_run_id
      AND review_status <> 'APPROVED';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_checklist_run_review_status ON public.checklist_review_flags;
CREATE TRIGGER trg_sync_checklist_run_review_status
AFTER INSERT OR UPDATE OR DELETE ON public.checklist_review_flags
FOR EACH ROW
EXECUTE FUNCTION public.sync_checklist_run_review_status();
