-- Convert a previously pending attendance row when a student reports an absence.
-- Never overwrite a teacher's finalized present or unannounced-absence decision.
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