-- Keep student cancellation reversible while enforcing the reservation trigger on rebooking.
DROP POLICY IF EXISTS "Students cancel own reservations" ON public.class_session_reservations;
CREATE POLICY "Students manage own reservation state"
  ON public.class_session_reservations FOR UPDATE TO authenticated
  USING (student_id = (SELECT auth.uid()))
  WITH CHECK (student_id = (SELECT auth.uid()) AND status IN ('booked', 'cancelled'));

-- A dated occurrence must match its recurring class weekday and alternating-week cycle.
CREATE OR REPLACE FUNCTION private.validate_class_session_occurrence()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  session_row public.class_sessions%ROWTYPE;
  target_weekday integer;
  anchor_weekday_date date;
  weeks integer;
  normalized_day text;
BEGIN
  SELECT * INTO session_row FROM public.class_sessions WHERE id = NEW.class_session_id;
  IF NOT FOUND OR session_row.is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'کلاس انتخاب‌شده فعال نیست.' USING ERRCODE = '23514';
  END IF;

  normalized_day := replace(btrim(session_row.class_day), chr(8204), '');
  target_weekday := CASE normalized_day
    WHEN 'یکشنبه' THEN 0 WHEN 'دوشنبه' THEN 1 WHEN 'سهشنبه' THEN 2
    WHEN 'چهارشنبه' THEN 3 WHEN 'پنجشنبه' THEN 4 WHEN 'جمعه' THEN 5
    WHEN 'شنبه' THEN 6 WHEN '0' THEN 0 WHEN '1' THEN 1 WHEN '2' THEN 2
    WHEN '3' THEN 3 WHEN '4' THEN 4 WHEN '5' THEN 5 WHEN '6' THEN 6
    ELSE NULL
  END;

  IF target_weekday IS NULL OR extract(dow FROM NEW.session_date)::integer <> target_weekday THEN
    RAISE EXCEPTION 'تاریخ انتخاب‌شده با روز برگزاری کلاس مطابقت ندارد.' USING ERRCODE = '23514';
  END IF;

  weeks := coalesce(session_row.recurrence_weeks, 1);
  IF session_row.session_date IS NOT NULL AND weeks <= 0 THEN
    IF NEW.session_date <> session_row.session_date THEN
      RAISE EXCEPTION 'تاریخ این جلسه با تاریخ تعریف‌شده در برنامه مطابقت ندارد.' USING ERRCODE = '23514';
    END IF;
  ELSIF weeks > 1 THEN
    IF session_row.recurrence_anchor_date IS NULL THEN
      RAISE EXCEPTION 'ابتدا تاریخ شروع چرخه یک‌هفته‌درمیان را در تنظیمات کلاس مشخص کنید.' USING ERRCODE = '23514';
    END IF;
    anchor_weekday_date := session_row.recurrence_anchor_date
      + (target_weekday - extract(dow FROM session_row.recurrence_anchor_date)::integer);
    IF NEW.session_date < anchor_weekday_date
      OR ((NEW.session_date - anchor_weekday_date) % (7 * weeks)) <> 0 THEN
      RAISE EXCEPTION 'این تاریخ در چرخه برگزاری یک‌هفته‌درمیان کلاس قرار ندارد.' USING ERRCODE = '23514';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION private.validate_class_session_occurrence()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS validate_class_session_occurrence ON public.class_session_occurrences;
CREATE TRIGGER validate_class_session_occurrence
  BEFORE INSERT OR UPDATE OF class_session_id, session_date
  ON public.class_session_occurrences
  FOR EACH ROW EXECUTE FUNCTION private.validate_class_session_occurrence();