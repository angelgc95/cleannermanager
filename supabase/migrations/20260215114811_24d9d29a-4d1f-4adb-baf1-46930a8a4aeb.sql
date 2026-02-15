
-- 1. Create source enum for log_hours
CREATE TYPE public.log_hours_source AS ENUM ('MANUAL', 'CHECKLIST');

-- 2. Extend log_hours table
ALTER TABLE public.log_hours 
  ADD COLUMN source public.log_hours_source DEFAULT 'MANUAL',
  ADD COLUMN checklist_run_id uuid REFERENCES public.checklist_runs(id),
  ADD COLUMN cleaning_task_id uuid REFERENCES public.cleaning_tasks(id);

-- Unique constraint: one log_hours per checklist_run
CREATE UNIQUE INDEX idx_log_hours_checklist_run ON public.log_hours(checklist_run_id) WHERE checklist_run_id IS NOT NULL;

-- 3. Create source enum for shopping_list
CREATE TYPE public.shopping_created_from AS ENUM ('MANUAL', 'CHECKLIST');

-- 4. Extend shopping_list table
ALTER TABLE public.shopping_list
  ADD COLUMN created_from public.shopping_created_from DEFAULT 'MANUAL',
  ADD COLUMN checklist_run_id uuid REFERENCES public.checklist_runs(id),
  ADD COLUMN last_cleared_at timestamptz,
  ADD COLUMN cleared_by_user_id uuid;
