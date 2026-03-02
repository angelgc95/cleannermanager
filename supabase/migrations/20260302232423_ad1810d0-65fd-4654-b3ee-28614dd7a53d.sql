
-- Allow cleaners to add products for their assigned host
CREATE POLICY "Cleaner can insert products" ON public.products
  FOR INSERT WITH CHECK (cleaner_is_assigned_to_host(auth.uid(), host_user_id));
