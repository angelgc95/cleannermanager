ALTER TABLE public.checklist_templates
  ADD COLUMN IF NOT EXISTS cleaner_experience_level integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS ai_listing_context jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.checklist_templates
  DROP CONSTRAINT IF EXISTS checklist_templates_cleaner_experience_level_check;

ALTER TABLE public.checklist_templates
  ADD CONSTRAINT checklist_templates_cleaner_experience_level_check
  CHECK (cleaner_experience_level BETWEEN 1 AND 3);
