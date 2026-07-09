ALTER TABLE public.cleaner_assignments
  ADD COLUMN IF NOT EXISTS assignment_weekdays integer[];

ALTER TABLE public.cleaner_assignments
  DROP CONSTRAINT IF EXISTS cleaner_assignments_weekdays_valid;

ALTER TABLE public.cleaner_assignments
  ADD CONSTRAINT cleaner_assignments_weekdays_valid
  CHECK (
    assignment_weekdays IS NULL
    OR array_length(assignment_weekdays, 1) IS NULL
    OR assignment_weekdays <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::integer[]
  );

CREATE INDEX IF NOT EXISTS idx_cleaner_assignments_host_listing
  ON public.cleaner_assignments(host_user_id, listing_id);

COMMENT ON COLUMN public.cleaner_assignments.assignment_weekdays IS
  'Optional weekday routing for this listing assignment, using 0=Sunday through 6=Saturday. NULL means unrestricted listing assignment fallback.';
