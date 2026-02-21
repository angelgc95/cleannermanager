
-- Link orphaned profiles to the existing organization
UPDATE profiles SET org_id = '2cde9c4e-2606-4e5d-b5a9-5e18e46b453e' 
WHERE org_id IS NULL AND user_id IN (
  '4ea0a0ac-fffa-4a40-a25b-1a1cfb30e330',
  '1d6d7acc-6caf-4902-b4aa-7f72bcd79ad6',
  '8f7d32f9-b152-48f9-abb0-081ef3738eae'
);

-- Assign cleaner role to orphaned users
INSERT INTO user_roles (user_id, role) VALUES
  ('4ea0a0ac-fffa-4a40-a25b-1a1cfb30e330', 'cleaner'),
  ('1d6d7acc-6caf-4902-b4aa-7f72bcd79ad6', 'cleaner'),
  ('8f7d32f9-b152-48f9-abb0-081ef3738eae', 'cleaner')
ON CONFLICT (user_id, role) DO NOTHING;
