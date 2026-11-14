CREATE INDEX IF NOT EXISTS attendance_adjustments_class_idx
  ON public.attendance_adjustments(class_id, session_date);
CREATE INDEX IF NOT EXISTS attendance_adjustments_recorded_by_idx
  ON public.attendance_adjustments(recorded_by);

DROP POLICY IF EXISTS "Staff read attendance adjustments" ON public.attendance_adjustments;
DROP POLICY IF EXISTS "Students read own attendance adjustments" ON public.attendance_adjustments;
DROP POLICY IF EXISTS "Read own adjustments or staff" ON public.attendance_adjustments;
CREATE POLICY "Read own adjustments or staff"
  ON public.attendance_adjustments FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()) OR (SELECT public.is_staff()));