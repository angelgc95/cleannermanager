-- Fix checklist_sections: scope to template owner
DROP POLICY IF EXISTS "Host can manage sections" ON public.checklist_sections;
CREATE POLICY "Host can manage own sections" ON public.checklist_sections
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.checklist_templates t
      WHERE t.id = checklist_sections.template_id AND t.host_user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.checklist_templates t
      WHERE t.id = checklist_sections.template_id AND t.host_user_id = auth.uid())
  );

-- Fix checklist_items: scope to template owner via section
DROP POLICY IF EXISTS "Host can manage items" ON public.checklist_items;
CREATE POLICY "Host can manage own items" ON public.checklist_items
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.checklist_sections s
      JOIN public.checklist_templates t ON t.id = s.template_id
      WHERE s.id = checklist_items.section_id AND t.host_user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.checklist_sections s
      JOIN public.checklist_templates t ON t.id = s.template_id
      WHERE s.id = checklist_items.section_id AND t.host_user_id = auth.uid())
  );

-- Make storage buckets private
UPDATE storage.buckets SET public = false WHERE id = 'checklist-photos';
UPDATE storage.buckets SET public = false WHERE id = 'guides';