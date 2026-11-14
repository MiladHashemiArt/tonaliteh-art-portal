-- Distinguish closing reservations from cancelling the actual class occurrence.
ALTER TABLE public.class_session_occurrences
  ADD COLUMN IF NOT EXISTS is_cancelled boolean NOT NULL DEFAULT false;

ALTER TABLE public.attendance_records
  DROP CONSTRAINT IF EXISTS attendance_records_status_check;
ALTER TABLE public.attendance_records
  ADD CONSTRAINT attendance_records_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text, 'present'::text, 'prior_notice_absence'::text,
    'no_notice_absence'::text, 'cancelled_session'::text
  ]));

CREATE OR REPLACE FUNCTION private.enforce_class_session_reservation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  occurrence_row public.class_session_occurrences%ROWTYPE;
  booked_count integer;
BEGIN
  IF NEW.status <> 'booked' THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  SELECT * INTO occurrence_row FROM public.class_session_occurrences
  WHERE id = NEW.occurrence_id FOR UPDATE;
  IF NOT FOUND OR NOT occurrence_row.is_open OR occurrence_row.is_cancelled THEN
    RAISE EXCEPTION 'این جلسه در حال حاضر برای رزرو باز نیست.' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.class_sessions cs
    WHERE cs.id = occurrence_row.class_session_id AND cs.is_active) THEN
    RAISE EXCEPTION 'این کلاس فعال نیست.' USING ERRCODE = '23514';
  END IF;
  IF NOT (SELECT public.is_staff()) AND NOT EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.class_id = occurrence_row.class_session_id AND e.student_id = NEW.student_id
  ) THEN
    RAISE EXCEPTION 'برای رزرو این جلسه ابتدا باید در کلاس ثبت‌نام کنید.' USING ERRCODE = '42501';
  END IF;
  SELECT count(*)::integer INTO booked_count FROM public.class_session_reservations r
  WHERE r.occurrence_id = NEW.occurrence_id AND r.status = 'booked' AND r.id <> NEW.id;
  IF booked_count >= occurrence_row.capacity THEN
    RAISE EXCEPTION 'ظرفیت این جلسه تکمیل شده است.' USING ERRCODE = '23514';
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
  IF TG_OP = 'INSERT' AND NEW.is_open AND NOT NEW.is_cancelled THEN
    notify_title := 'جلسهٔ جدید برای رزرو';
    notify_body := 'استاد یک جلسهٔ جدید را برای تاریخ ' || NEW.session_date::text || ' منتشر کرده است. برای رزرو به پنل هنرجویی مراجعه کنید.';
  ELSIF TG_OP = 'UPDATE' AND OLD.is_cancelled IS DISTINCT FROM NEW.is_cancelled AND NEW.is_cancelled THEN
    UPDATE public.class_session_reservations
    SET status = 'cancelled'
    WHERE occurrence_id = NEW.id AND status = 'booked';

    UPDATE public.attendance_records
    SET status = 'cancelled_session',
        note = 'جلسه توسط استاد لغو شد.',
        marked_by = NULL,
        marked_at = NULL,
        updated_at = now()
    WHERE class_id = NEW.class_session_id
      AND session_date = NEW.session_date
      AND status IN ('pending', 'prior_notice_absence');

    notify_title := 'جلسه لغو شد';
    notify_body := 'جلسهٔ تاریخ ' || NEW.session_date::text || ' توسط استاد لغو شد. رزروهای قبلی نیز لغو شدند.';
  ELSIF TG_OP = 'UPDATE' AND OLD.is_open IS DISTINCT FROM NEW.is_open THEN
    IF NEW.is_open AND NOT NEW.is_cancelled THEN
      notify_title := 'رزرو جلسه دوباره فعال شد';
      notify_body := 'رزرو جلسهٔ تاریخ ' || NEW.session_date::text || ' دوباره باز شده است.';
    ELSE
      notify_title := 'رزرو جلسه بسته شد';
      notify_body := 'رزرو جلسهٔ تاریخ ' || NEW.session_date::text || ' بسته شده است؛ خود جلسه لغو نشده است.';
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

-- Remove the duplicate pending-attendance trigger: the richer trigger above this one
-- preserves pre-announced absences, whereas the older one always inserts pending.
DROP TRIGGER IF EXISTS sync_attendance_from_reservation ON public.class_session_reservations;

DROP TRIGGER IF EXISTS notify_class_session_occurrence_change ON public.class_session_occurrences;
CREATE TRIGGER notify_class_session_occurrence_change
  AFTER INSERT OR UPDATE OF is_open, is_cancelled ON public.class_session_occurrences
  FOR EACH ROW
  EXECUTE FUNCTION private.notify_class_session_occurrence_change();
