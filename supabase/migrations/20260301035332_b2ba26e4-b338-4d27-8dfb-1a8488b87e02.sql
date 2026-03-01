
-- Add timer_minutes column to checklist_items for alarm/timer functionality
ALTER TABLE public.checklist_items ADD COLUMN timer_minutes integer NULL DEFAULT NULL;

COMMENT ON COLUMN public.checklist_items.timer_minutes IS 'Optional timer in minutes. When item is marked done, a countdown starts. At 0, a persistent notification appears.';
