-- Create a pending attendance row as soon as a student confirms a weekly reservation.
-- A pre-existing absence notice takes precedence; existing teacher-finalized rows are never overwritten.
CREATE OR REPLACE FUNCTION private.create_attendance_for_class_reservation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  occurrence_row public.class_session_occurrences%ROWTYPE;
  initial_status text;
  absence_note text;
BEGIN
  IF NEW.status <> 'booked' THEN RETURN NEW; END IF;

  SELECT * INTO occurrence_row FROM public.class_session_occurrences WHERE id = NEW.occurrence_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT a.description INTO absence_note
  FROM public.absences a
  WHERE a.student_id = NEW.student_id
    AND a.class_id = occurrence_row.class_session_id
    AND a.absence_date = occurrence_row.session_date
  ORDER BY a.created_at DESC LIMIT 1;

  initial_status := CASE WHEN FOUND THEN 'prior_notice_absence' ELSE 'pending' END;

  INSERT INTO public.attendance_records
    (student_id, class_id, session_date, status, note)
  VALUES
    (NEW.student_id, occurrence_row.class_session_id, occurrence_row.session_date,
     initial_status, absence_note)
  ON CONFLICT (student_id, class_id, session_date) DO NOTHING;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION private.create_attendance_for_class_reservation()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS create_attendance_for_class_reservation ON public.class_session_reservations;
CREATE TRIGGER create_attendance_for_class_reservation
  AFTER INSERT OR UPDATE OF status ON public.class_session_reservations
  FOR EACH ROW WHEN (NEW.status = 'booked')
  EXECUTE FUNCTION private.create_attendance_for_class_reservation();

-- If an absence is reported after booking, mark only an unfinalized attendance row.
CREATE OR REPLACE FUNCTION private.sync_attendance_from_absence_notice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  IF NEW.class_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.attendance_records
    (student_id, class_id, session_date, status, note)
  VALUES
    (NEW.student_id, NEW.class_id, NEW.absence_date, 'prior_notice_absence', NEW.description)
  ON CONFLICT (student_id, class_id, session_date)
  DO UPDATE SET
    status = 'prior_notice_absence',
    note = coalesce(EXCLUDED.note, public.attendance_records.note),
    marked_by = NULL,
    marked_at = NULL,
    updated_at = now()
  WHERE public.attendance_records.status = 'pending';
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION private.sync_attendance_from_absence_notice()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS sync_attendance_from_absence_notice ON public.absences;
CREATE TRIGGER sync_attendance_from_absence_notice
  AFTER INSERT ON public.absences
  FOR EACH ROW EXECUTE FUNCTION private.sync_attendance_from_absence_notice();