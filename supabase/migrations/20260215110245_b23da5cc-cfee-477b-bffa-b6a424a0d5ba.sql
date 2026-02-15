
-- Fix overly permissive policies
DROP POLICY "Cleaners can insert responses" ON public.checklist_responses;
DROP POLICY "Cleaners can update responses" ON public.checklist_responses;
DROP POLICY "Users can update shopping items" ON public.shopping_list;

-- Checklist responses: user can insert/update if they own the run
CREATE POLICY "Users can insert responses for own runs" ON public.checklist_responses 
FOR INSERT TO authenticated 
WITH CHECK (EXISTS (SELECT 1 FROM public.checklist_runs WHERE id = run_id AND cleaner_user_id = auth.uid()));

CREATE POLICY "Users can update responses for own runs" ON public.checklist_responses 
FOR UPDATE TO authenticated 
USING (EXISTS (SELECT 1 FROM public.checklist_runs WHERE id = run_id AND cleaner_user_id = auth.uid()));

-- Shopping list: authenticated users can update
CREATE POLICY "Authenticated users can update shopping items" ON public.shopping_list 
FOR UPDATE TO authenticated 
USING (created_by_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));
