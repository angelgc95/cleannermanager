-- Fix #1: Allow cleaners to SELECT their own checklist_photos (photos they uploaded via their runs)
CREATE POLICY "Cleaner can view own photos"
ON public.checklist_photos
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM checklist_runs
    WHERE checklist_runs.id = checklist_photos.run_id
    AND checklist_runs.cleaner_user_id = auth.uid()
  )
);