CREATE OR REPLACE FUNCTION private.create_payment_for_approved_student_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payment_id uuid;
BEGIN
  IF NEW.status = 'approved'
     AND NEW.payment_id IS NULL
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    INSERT INTO public.payments (student_id, amount, payment_date, status, description)
    VALUES (
      NEW.student_id,
      NEW.amount,
      now(),
      'pending',
      'هزینه جانبی هنرجو · ' || NEW.title || ' · ' || NEW.expense_date::text
    )
    RETURNING id INTO v_payment_id;

    UPDATE public.student_expenses
    SET payment_id = v_payment_id
    WHERE id = NEW.id AND payment_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS student_expenses_payment_id_unique_idx
ON public.student_expenses (payment_id)
WHERE payment_id IS NOT NULL;
