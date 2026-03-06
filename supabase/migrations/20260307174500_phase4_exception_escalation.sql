-- Phase 4 extension: escalation metadata + anti-duplicate open exceptions

ALTER TABLE public.v1_event_exceptions
  ADD COLUMN IF NOT EXISTS last_notified_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS escalation_level integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_escalation_at timestamptz NULL;

ALTER TABLE public.v1_event_exceptions
  DROP CONSTRAINT IF EXISTS v1_event_exceptions_escalation_level_non_negative;

ALTER TABLE public.v1_event_exceptions
  ADD CONSTRAINT v1_event_exceptions_escalation_level_non_negative
  CHECK (escalation_level >= 0);

-- Keep only one non-resolved exception per (org,event,type) by resolving older duplicates.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY organization_id, event_id, type
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.v1_event_exceptions
  WHERE status IN ('OPEN', 'ACKNOWLEDGED')
)
UPDATE public.v1_event_exceptions ex
SET
  status = 'RESOLVED',
  resolved_at = COALESCE(ex.resolved_at, now())
FROM ranked r
WHERE ex.id = r.id
  AND r.rn > 1
  AND ex.status IN ('OPEN', 'ACKNOWLEDGED');

CREATE UNIQUE INDEX IF NOT EXISTS v1_event_exceptions_one_open_per_type_idx
  ON public.v1_event_exceptions(organization_id, event_id, type)
  WHERE status IN ('OPEN', 'ACKNOWLEDGED');
