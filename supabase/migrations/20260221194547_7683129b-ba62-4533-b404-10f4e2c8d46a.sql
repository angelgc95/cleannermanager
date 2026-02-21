
-- Add unique_code column to profiles for cleaner identification (6 numbers + 1 letter)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS unique_code TEXT UNIQUE;

-- Generate unique codes for existing profiles that don't have one
UPDATE public.profiles
SET unique_code = LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0') || CHR(65 + FLOOR(RANDOM() * 26)::INT)
WHERE unique_code IS NULL;

-- Create cleaner_assignments table for standing listing assignments
CREATE TABLE IF NOT EXISTS public.cleaner_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cleaner_user_id UUID NOT NULL,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cleaner_user_id, property_id)
);

ALTER TABLE public.cleaner_assignments ENABLE ROW LEVEL SECURITY;

-- Admins/managers can manage assignments
CREATE POLICY "Admins can manage cleaner assignments"
  ON public.cleaner_assignments
  FOR ALL
  USING (
    org_id = get_user_org_id(auth.uid())
    AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))
  );

-- Cleaners can view their own assignments
CREATE POLICY "Cleaners can view own assignments"
  ON public.cleaner_assignments
  FOR SELECT
  USING (
    org_id = get_user_org_id(auth.uid())
    AND cleaner_user_id = auth.uid()
  );

-- Function to generate unique code for new users
CREATE OR REPLACE FUNCTION public.generate_unique_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
BEGIN
  LOOP
    new_code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0') || CHR(65 + FLOOR(RANDOM() * 26)::INT);
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE unique_code = new_code) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  NEW.unique_code := new_code;
  RETURN NEW;
END;
$$;

-- Auto-generate unique_code on profile insert if not set
CREATE TRIGGER set_unique_code
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  WHEN (NEW.unique_code IS NULL)
  EXECUTE FUNCTION public.generate_unique_code();
