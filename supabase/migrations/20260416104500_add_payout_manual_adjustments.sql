ALTER TABLE public.payouts
  ADD COLUMN IF NOT EXISTS calculated_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS manual_adjustment_amount numeric(10,2) NOT NULL DEFAULT 0;

UPDATE public.payouts
SET
  calculated_amount = COALESCE(calculated_amount, total_amount, 0),
  manual_adjustment_amount = COALESCE(manual_adjustment_amount, 0)
WHERE calculated_amount IS NULL;

ALTER TABLE public.payouts
  ALTER COLUMN calculated_amount SET NOT NULL;

ALTER TABLE public.payouts
  DROP CONSTRAINT IF EXISTS payouts_calculated_amount_non_negative;

ALTER TABLE public.payouts
  ADD CONSTRAINT payouts_calculated_amount_non_negative
  CHECK (calculated_amount >= 0);

ALTER TABLE public.payouts
  DROP CONSTRAINT IF EXISTS payouts_adjusted_total_non_negative;

ALTER TABLE public.payouts
  ADD CONSTRAINT payouts_adjusted_total_non_negative
  CHECK ((calculated_amount + manual_adjustment_amount) >= 0);

CREATE OR REPLACE FUNCTION public.apply_payout_manual_adjustment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.calculated_amount := COALESCE(NEW.calculated_amount, NEW.total_amount, 0);
  NEW.manual_adjustment_amount := COALESCE(NEW.manual_adjustment_amount, 0);
  NEW.total_amount := round((NEW.calculated_amount + NEW.manual_adjustment_amount)::numeric, 2);

  IF NEW.total_amount < 0 THEN
    RAISE EXCEPTION 'Payout total cannot be negative after manual adjustment';
  END IF;

  IF NEW.status = 'PAID' THEN
    NEW.partial_paid_amount := NEW.total_amount;
  END IF;

  IF NEW.partial_paid_amount IS NOT NULL AND NEW.partial_paid_amount > NEW.total_amount THEN
    RAISE EXCEPTION 'Partial paid amount cannot exceed payout total';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_payout_manual_adjustment ON public.payouts;

CREATE TRIGGER trg_apply_payout_manual_adjustment
BEFORE INSERT OR UPDATE OF calculated_amount, manual_adjustment_amount, total_amount, status, partial_paid_amount
ON public.payouts
FOR EACH ROW
EXECUTE FUNCTION public.apply_payout_manual_adjustment();

COMMENT ON COLUMN public.payouts.calculated_amount IS
  'Original generated payout amount before any host manual adjustment.';

COMMENT ON COLUMN public.payouts.manual_adjustment_amount IS
  'Signed host adjustment applied on top of calculated_amount. Positive values add money; negative values subtract money.';

ALTER TABLE public.cleaning_events
  ADD COLUMN IF NOT EXISTS payout_id uuid REFERENCES public.payouts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cleaning_events_payout_id
  ON public.cleaning_events(payout_id);

COMMENT ON COLUMN public.cleaning_events.payout_id IS
  'Payout that included this cleaning event for per-event cleaner compensation.';
