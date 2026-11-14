-- A cancelled class already emits one occurrence-level notification to every enrolled student.
-- Suppress the per-attendance notification to avoid sending one duplicate per roster row.
CREATE OR REPLACE FUNCTION private.notify_student_attendance_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_status_label text;
  v_title text;
  v_body text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status IN ('pending', 'cancelled_session') THEN
    RETURN NEW;
  END IF;

  v_status_label := CASE NEW.status
    WHEN 'present' THEN 'حاضر'
    WHEN 'prior_notice_absence' THEN 'غیبت با اطلاع'
    WHEN 'no_notice_absence' THEN 'غیبت بدون اطلاع'
    ELSE NEW.status
  END;
  v_title := CASE WHEN TG_OP = 'INSERT' THEN 'وضعیت حضور شما ثبت شد'
    ELSE 'وضعیت حضور شما تغییر کرد' END;
  v_body := 'وضعیت جلسهٔ ' || to_char(NEW.session_date, 'YYYY/MM/DD') ||
    ' برای شما «' || v_status_label || '» ثبت شده است.';
  INSERT INTO public.notifications (user_id, title, body, notification_type, related_id)
  VALUES (NEW.student_id, v_title, v_body, 'attendance', NEW.id);
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION private.notify_student_attendance_status()
  FROM PUBLIC, anon, authenticated, service_role;
