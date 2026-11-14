CREATE TABLE IF NOT EXISTS public.attendance_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id uuid NOT NULL REFERENCES public.attendance_records(id) ON DELETE RESTRICT,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  class_id uuid NOT NULL REFERENCES public.class_sessions(id) ON DELETE RESTRICT,
  session_date date NOT NULL,
  adjustment_type text NOT NULL CHECK (adjustment_type IN ('extra_time', 'extra_session')),
  quantity_minutes integer,
  unit_rate numeric(14,2) NOT NULL CHECK (unit_rate > 0),
  amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount > 0),
  description text,
  payment_id uuid REFERENCES public.payments(id) ON DELETE RESTRICT,
  recorded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_adjustments_quantity_check CHECK (
    (adjustment_type = 'extra_time' AND quantity_minutes BETWEEN 1 AND 480)
    OR (adjustment_type = 'extra_session' AND (quantity_minutes IS NULL OR quantity_minutes = 0))
  )
);

CREATE INDEX IF NOT EXISTS attendance_adjustments_attendance_idx
  ON public.attendance_adjustments(attendance_id, created_at DESC);
CREATE INDEX IF NOT EXISTS attendance_adjustments_student_idx
  ON public.attendance_adjustments(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS attendance_adjustments_payment_idx
  ON public.attendance_adjustments(payment_id);

ALTER TABLE public.attendance_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read attendance adjustments" ON public.attendance_adjustments;
CREATE POLICY "Staff read attendance adjustments"
  ON public.attendance_adjustments FOR SELECT TO authenticated
  USING ((SELECT public.is_staff()));
DROP POLICY IF EXISTS "Students read own attendance adjustments" ON public.attendance_adjustments;
CREATE POLICY "Students read own attendance adjustments"
  ON public.attendance_adjustments FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Staff create attendance adjustments" ON public.attendance_adjustments;
CREATE POLICY "Staff create attendance adjustments"
  ON public.attendance_adjustments FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_staff()) AND recorded_by = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION private.validate_attendance_adjustment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_rate numeric(14,2);
  v_status text;
  v_setting_key text;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'فقط استاد یا مدیریت می‌تواند هزینه اضافه را ثبت کند.' USING ERRCODE = '42501';
  END IF;

  v_setting_key := CASE NEW.adjustment_type
    WHEN 'extra_time' THEN 'extra_hourly_rate'
    WHEN 'extra_session' THEN 'extra_session_rate'
    ELSE NULL
  END;

  SELECT nullif(trim(s.value), '')::numeric INTO v_rate
  FROM public.site_settings s WHERE s.key = v_setting_key;
  IF v_rate IS NULL OR v_rate <= 0 THEN
    RAISE EXCEPTION 'ابتدا نرخ این خدمت را در تنظیمات مشخص کنید.' USING ERRCODE = '23514';
  END IF;

  SELECT a.status INTO v_status
  FROM public.attendance_records a
  WHERE a.id = NEW.attendance_id AND a.student_id = NEW.student_id
    AND a.class_id = NEW.class_id AND a.session_date = NEW.session_date;
  IF v_status IS DISTINCT FROM 'present' THEN
    RAISE EXCEPTION 'ثبت هزینه اضافه فقط برای هنرجوی حاضر امکان‌پذیر است.' USING ERRCODE = '23514';
  END IF;

  NEW.unit_rate := v_rate;
  IF NEW.adjustment_type = 'extra_time' THEN
    IF NEW.quantity_minutes IS NULL OR NEW.quantity_minutes < 1 OR NEW.quantity_minutes > 480 THEN
      RAISE EXCEPTION 'مدت اضافه‌زمان باید بین ۱ تا ۴۸۰ دقیقه باشد.' USING ERRCODE = '23514';
    END IF;
    NEW.amount := round(v_rate * NEW.quantity_minutes / 60.0, 0);
  ELSE
    NEW.quantity_minutes := NULL;
    NEW.amount := v_rate;
  END IF;
  IF NEW.amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ محاسبه‌شده معتبر نیست.' USING ERRCODE = '23514';
  END IF;
  NEW.recorded_by := auth.uid();
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION private.validate_attendance_adjustment()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS validate_attendance_adjustment ON public.attendance_adjustments;
CREATE TRIGGER validate_attendance_adjustment
  BEFORE INSERT ON public.attendance_adjustments
  FOR EACH ROW EXECUTE FUNCTION private.validate_attendance_adjustment();

CREATE OR REPLACE FUNCTION private.create_payment_for_attendance_adjustment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_payment_id uuid;
  v_description text;
BEGIN
  v_description := CASE NEW.adjustment_type
    WHEN 'extra_time' THEN 'هزینه اضافه‌زمان · ' || NEW.quantity_minutes::text || ' دقیقه · ' || NEW.session_date::text
    ELSE 'هزینه اضافه‌جلسه · ' || NEW.session_date::text
  END;
  INSERT INTO public.payments (student_id, amount, payment_date, status, description)
  VALUES (NEW.student_id, NEW.amount, now(), 'pending', v_description)
  RETURNING id INTO v_payment_id;
  UPDATE public.attendance_adjustments SET payment_id = v_payment_id WHERE id = NEW.id;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION private.create_payment_for_attendance_adjustment()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS create_payment_for_attendance_adjustment ON public.attendance_adjustments;
CREATE TRIGGER create_payment_for_attendance_adjustment
  AFTER INSERT ON public.attendance_adjustments
  FOR EACH ROW EXECUTE FUNCTION private.create_payment_for_attendance_adjustment();

CREATE OR REPLACE FUNCTION private.prevent_attendance_status_change_with_adjustments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  IF OLD.status = 'present' AND NEW.status <> 'present'
     AND EXISTS (SELECT 1 FROM public.attendance_adjustments x WHERE x.attendance_id = OLD.id) THEN
    RAISE EXCEPTION 'برای این حضور هزینه اضافه ثبت شده است؛ ابتدا وضعیت مالی را بررسی کنید.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION private.prevent_attendance_status_change_with_adjustments()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS prevent_attendance_status_change_with_adjustments ON public.attendance_records;
CREATE TRIGGER prevent_attendance_status_change_with_adjustments
  BEFORE UPDATE OF status ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION private.prevent_attendance_status_change_with_adjustments();