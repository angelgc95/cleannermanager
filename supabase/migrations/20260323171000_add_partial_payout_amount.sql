DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumlabel = 'PARTIALLY_PAID'
      AND enumtypid = 'public.payout_status'::regtype
  ) THEN
    ALTER TYPE public.payout_status ADD VALUE 'PARTIALLY_PAID' AFTER 'PENDING';
  END IF;
END $$;

ALTER TABLE public.payouts
ADD COLUMN IF NOT EXISTS partial_paid_amount numeric;

ALTER TABLE public.payouts
DROP CONSTRAINT IF EXISTS payouts_partial_paid_amount_valid;

ALTER TABLE public.payouts
ADD CONSTRAINT payouts_partial_paid_amount_valid
CHECK (
  partial_paid_amount IS NULL
  OR (
    partial_paid_amount >= 0
    AND partial_paid_amount <= total_amount
  )
);
