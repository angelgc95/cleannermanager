
ALTER TABLE public.cleaning_tasks
  ADD COLUMN IF NOT EXISTS reference text;
