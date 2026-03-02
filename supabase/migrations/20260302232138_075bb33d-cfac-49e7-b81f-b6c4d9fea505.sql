
-- Create tasks table for independent host-to-cleaner tasks
CREATE TABLE public.tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  host_user_id UUID NOT NULL,
  assigned_cleaner_id UUID NOT NULL,
  label TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'YESNO',
  required BOOLEAN NOT NULL DEFAULT true,
  help_text TEXT,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'TODO',
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Host can manage all their tasks
CREATE POLICY "Host can manage tasks" ON public.tasks
  FOR ALL USING (host_user_id = auth.uid());

-- Cleaner can view assigned tasks
CREATE POLICY "Cleaner can view assigned tasks" ON public.tasks
  FOR SELECT USING (assigned_cleaner_id = auth.uid());

-- Cleaner can update assigned tasks (mark done)
CREATE POLICY "Cleaner can update assigned tasks" ON public.tasks
  FOR UPDATE USING (assigned_cleaner_id = auth.uid());

-- Updated_at trigger
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
