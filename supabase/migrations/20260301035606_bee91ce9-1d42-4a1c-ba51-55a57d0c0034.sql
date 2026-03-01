
-- Add TIMER to the checklist_item_type enum
ALTER TYPE public.checklist_item_type ADD VALUE IF NOT EXISTS 'TIMER';

-- Add dependency column: which item triggers this timer
ALTER TABLE public.checklist_items ADD COLUMN depends_on_item_id uuid NULL REFERENCES public.checklist_items(id) ON DELETE SET NULL;
