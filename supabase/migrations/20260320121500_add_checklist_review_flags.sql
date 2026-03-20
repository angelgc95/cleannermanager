CREATE TABLE public.checklist_review_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cleaning_event_id uuid NOT NULL REFERENCES public.cleaning_events(id) ON DELETE CASCADE,
  checklist_run_id uuid NOT NULL REFERENCES public.checklist_runs(id) ON DELETE CASCADE,
  host_user_id uuid NOT NULL,
  cleaner_user_id uuid NOT NULL,
  comment text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'REVIEWED')),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_checklist_review_flags_event_created
ON public.checklist_review_flags(cleaning_event_id, created_at DESC);

CREATE INDEX idx_checklist_review_flags_cleaner_status
ON public.checklist_review_flags(cleaner_user_id, status, created_at DESC);

CREATE TABLE public.checklist_review_flag_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_id uuid NOT NULL REFERENCES public.checklist_review_flags(id) ON DELETE CASCADE,
  checklist_photo_id uuid NOT NULL REFERENCES public.checklist_photos(id) ON DELETE CASCADE,
  annotation_type text CHECK (annotation_type IN ('circle', 'arrow', 'box')),
  annotation_x double precision,
  annotation_y double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(flag_id, checklist_photo_id)
);

CREATE INDEX idx_checklist_review_flag_photos_flag
ON public.checklist_review_flag_photos(flag_id);

ALTER TABLE public.checklist_review_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_review_flag_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Host can view own checklist review flags"
ON public.checklist_review_flags
FOR SELECT
USING (host_user_id = auth.uid());

CREATE POLICY "Cleaner can view own checklist review flags"
ON public.checklist_review_flags
FOR SELECT
USING (cleaner_user_id = auth.uid());

CREATE POLICY "Host can insert own checklist review flags"
ON public.checklist_review_flags
FOR INSERT
WITH CHECK (
  host_user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.checklist_runs cr
    WHERE cr.id = checklist_run_id
      AND cr.cleaning_event_id = cleaning_event_id
      AND cr.host_user_id = auth.uid()
      AND cr.cleaner_user_id = checklist_review_flags.cleaner_user_id
  )
);

CREATE POLICY "Host can update own checklist review flags"
ON public.checklist_review_flags
FOR UPDATE
USING (host_user_id = auth.uid());

CREATE POLICY "Host can delete own checklist review flags"
ON public.checklist_review_flags
FOR DELETE
USING (host_user_id = auth.uid());

CREATE POLICY "Cleaner can update own checklist review flags"
ON public.checklist_review_flags
FOR UPDATE
USING (cleaner_user_id = auth.uid());

CREATE POLICY "Host can view own checklist review flag photos"
ON public.checklist_review_flag_photos
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.checklist_review_flags f
    WHERE f.id = checklist_review_flag_photos.flag_id
      AND f.host_user_id = auth.uid()
  )
);

CREATE POLICY "Cleaner can view own checklist review flag photos"
ON public.checklist_review_flag_photos
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.checklist_review_flags f
    WHERE f.id = checklist_review_flag_photos.flag_id
      AND f.cleaner_user_id = auth.uid()
  )
);

CREATE POLICY "Host can insert own checklist review flag photos"
ON public.checklist_review_flag_photos
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.checklist_review_flags f
    WHERE f.id = checklist_review_flag_photos.flag_id
      AND f.host_user_id = auth.uid()
  )
);

CREATE POLICY "Host can update own checklist review flag photos"
ON public.checklist_review_flag_photos
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.checklist_review_flags f
    WHERE f.id = checklist_review_flag_photos.flag_id
      AND f.host_user_id = auth.uid()
  )
);

CREATE POLICY "Host can delete own checklist review flag photos"
ON public.checklist_review_flag_photos
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM public.checklist_review_flags f
    WHERE f.id = checklist_review_flag_photos.flag_id
      AND f.host_user_id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.notify_checklist_review_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.in_app_notifications (user_id, host_user_id, title, body, link)
  VALUES (
    NEW.cleaner_user_id,
    NEW.host_user_id,
    'Checklist review requested',
    CASE
      WHEN length(NEW.comment) > 140 THEN left(NEW.comment, 137) || '...'
      ELSE NEW.comment
    END,
    '/events/' || NEW.cleaning_event_id::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_checklist_review_flag ON public.checklist_review_flags;
CREATE TRIGGER trg_notify_checklist_review_flag
AFTER INSERT ON public.checklist_review_flags
FOR EACH ROW
EXECUTE FUNCTION public.notify_checklist_review_flag();
