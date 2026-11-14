CREATE OR REPLACE FUNCTION private.create_payment_for_attendance_adjustment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_payment_id uuid;
  v_description text;
BEGIN
  v_description := CASE NEW.adjustment_type
    WHEN 'extra_time' THEN 'هزینه اضافه‌زمان · ' || NEW.quantity_minutes::text || ' دقیقه · ' || NEW.session_date::text
    ELSE 'هزینه اضافه‌جلسه · ' || NEW.session_date::text
  END;

  INSERT INTO public.payments
    (student_id, amount, payment_date, status, description, payment_type, payment_method)
  VALUES
    (NEW.student_id, NEW.amount, now(), 'pending', v_description, 'extra_class', 'unknown')
  RETURNING id INTO v_payment_id;

  UPDATE public.attendance_adjustments
  SET payment_id = v_payment_id
  WHERE id = NEW.id;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.create_payment_for_approved_student_expense()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_payment_id uuid;
  v_payment_type text;
BEGIN
  IF NEW.status = 'approved'
     AND NEW.payment_id IS NULL
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    v_payment_type := CASE
      WHEN NEW.category IN ('materials', 'tools') THEN 'materials'
      ELSE 'other'
    END;

    INSERT INTO public.payments
      (student_id, amount, payment_date, status, description, payment_type, payment_method)
    VALUES (
      NEW.student_id,
      NEW.amount,
      now(),
      'pending',
      'هزینه جانبی هنرجو · ' || NEW.title || ' · ' || NEW.expense_date::text,
      v_payment_type,
      'unknown'
    )
    RETURNING id INTO v_payment_id;

    UPDATE public.student_expenses
    SET payment_id = v_payment_id
    WHERE id = NEW.id AND payment_id IS NULL;
  END IF;
  RETURN NEW;
END;
$function$;
