-- Thursday sessions are published manually for an exact date by staff.
-- Tuesday/Friday and other recurring templates retain their existing recurrence rules.

UPDATE public.class_sessions
SET recurrence_weeks = 1,
    recurrence_anchor_date = NULL
WHERE replace(btrim(class_day::text), chr(8204), '') = 'پنجشنبه'
  AND (recurrence_weeks IS DISTINCT FROM 1 OR recurrence_anchor_date IS NOT NULL);

CREATE OR REPLACE FUNCTION private.validate_class_session_occurrence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  session_row public.class_sessions%ROWTYPE;
  target_weekday integer;
  anchor_weekday_date date;
  weeks integer;
  normalized_day text;
BEGIN
  SELECT * INTO session_row
  FROM public.class_sessions
  WHERE id = NEW.class_session_id;

  IF NOT FOUND OR session_row.is_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'کلاس انتخاب‌شده فعال نیست.' USING ERRCODE = '23514';
  END IF;

  normalized_day := replace(btrim(session_row.class_day::text), chr(8204), '');
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

  -- Thursday has no fixed recurrence or anchor: each occurrence is a staff decision.
  IF normalized_day <> 'پنجشنبه' THEN
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
        RAISE EXCEPTION 'این تاریخ در چرخه برگزاری کلاس قرار ندارد.' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.notify_class_session_occurrence_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  notify_title text;
  notify_body text;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.is_open THEN
    notify_title := 'جلسهٔ جدید برای رزرو';
    notify_body := 'استاد یک جلسهٔ جدید را برای تاریخ ' || NEW.session_date::text || ' منتشر کرده است. برای رزرو به پنل هنرجویی مراجعه کنید.';
  ELSIF TG_OP = 'UPDATE' AND OLD.is_open IS DISTINCT FROM NEW.is_open THEN
    IF NEW.is_open THEN
      notify_title := 'رزرو جلسه دوباره فعال شد';
      notify_body := 'رزرو جلسهٔ تاریخ ' || NEW.session_date::text || ' دوباره باز شده است.';
    ELSE
      notify_title := 'جلسه لغو شد / رزرو بسته شد';
      notify_body := 'رزرو جلسهٔ تاریخ ' || NEW.session_date::text || ' توسط استاد بسته شده است.';
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, title, body, notification_type, related_id)
  SELECT DISTINCT e.student_id, notify_title, notify_body, 'class_session', NEW.id
  FROM public.enrollments e
  WHERE e.class_id = NEW.class_session_id;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION private.notify_class_session_occurrence_change()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS notify_class_session_occurrence_change ON public.class_session_occurrences;
CREATE TRIGGER notify_class_session_occurrence_change
  AFTER INSERT OR UPDATE OF is_open ON public.class_session_occurrences
  FOR EACH ROW
  EXECUTE FUNCTION private.notify_class_session_occurrence_change();
