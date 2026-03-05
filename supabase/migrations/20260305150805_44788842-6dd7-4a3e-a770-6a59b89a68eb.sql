CREATE OR REPLACE FUNCTION public.claim_notification_jobs(batch_size int DEFAULT 100)
RETURNS SETOF notification_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE notification_jobs
  SET status = 'PROCESSING', updated_at = now()
  WHERE id IN (
    SELECT id FROM notification_jobs
    WHERE status = 'SCHEDULED'
      AND scheduled_for <= now()
    ORDER BY scheduled_for
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;