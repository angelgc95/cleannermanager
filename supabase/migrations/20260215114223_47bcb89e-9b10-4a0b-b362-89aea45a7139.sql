
-- Storage bucket for checklist photos
INSERT INTO storage.buckets (id, name, public) VALUES ('checklist-photos', 'checklist-photos', true);

-- RLS policies for checklist-photos bucket
CREATE POLICY "Authenticated users can upload checklist photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'checklist-photos');

CREATE POLICY "Anyone can view checklist photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'checklist-photos');

CREATE POLICY "Users can delete own checklist photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'checklist-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Add item_key column to checklist_items for CSV mapping
ALTER TABLE public.checklist_items ADD COLUMN IF NOT EXISTS item_key TEXT;

-- Add a checklist_photos table for multiple photos per item per run
CREATE TABLE public.checklist_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.checklist_runs(id) ON DELETE CASCADE NOT NULL,
  item_id UUID REFERENCES public.checklist_items(id) ON DELETE CASCADE NOT NULL,
  photo_url TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.checklist_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view checklist photos" ON public.checklist_photos
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert photos for own runs" ON public.checklist_photos
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.checklist_runs WHERE id = run_id AND cleaner_user_id = auth.uid()));
CREATE POLICY "Users can delete photos for own runs" ON public.checklist_photos
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.checklist_runs WHERE id = run_id AND cleaner_user_id = auth.uid()));
