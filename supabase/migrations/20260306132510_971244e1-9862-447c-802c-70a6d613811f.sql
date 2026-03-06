-- Add checklist_run_id to maintenance_tickets for "created via checklist" tracking
ALTER TABLE public.maintenance_tickets
  ADD COLUMN IF NOT EXISTS checklist_run_id uuid REFERENCES public.checklist_runs(id) ON DELETE SET NULL;

-- Add last_seen_at to bookings for iCal cancellation grace window
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- Index for maintenance_tickets by run_id
CREATE INDEX IF NOT EXISTS idx_maintenance_tickets_run_id ON maintenance_tickets(checklist_run_id) WHERE checklist_run_id IS NOT NULL;