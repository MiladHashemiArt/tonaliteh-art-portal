-- Weekly, date-specific session publication and student reservations.
-- Additive only: existing recurring enrollments and attendance data remain intact.

CREATE TABLE public.class_session_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_session_id uuid NOT NULL REFERENCES public.class_sessions(id) ON DELETE CASCADE,
  session_date date NOT NULL,
  is_open boolean NOT NULL DEFAULT false,
  capacity integer NOT NULL CHECK (capacity > 0),
  published_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT class_session_occurrences_session_date_key UNIQUE (class_session_id, session_date)
);

CREATE TABLE public.class_session_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurrence_id uuid NOT NULL REFERENCES public.class_session_occurrences(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'booked' CHECK (status IN ('booked', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT class_session_reservations_occurrence_student_key UNIQUE (occurrence_id, student_id)
);

CREATE INDEX class_session_occurrences_date_open_idx
  ON public.class_session_occurrences (session_date, is_open);
CREATE INDEX class_session_reservations_student_status_idx
  ON public.class_session_reservations (student_id, status);
CREATE INDEX class_session_reservations_occurrence_status_idx
  ON public.class_session_reservations (occurrence_id, status);

ALTER TABLE public.class_session_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_session_reservations ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_session_occurrences TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_session_reservations TO authenticated;

CREATE POLICY "Read open occurrences or staff"
  ON public.class_session_occurrences FOR SELECT TO authenticated
  USING (is_open OR (SELECT public.is_staff()));

CREATE POLICY "Staff manage occurrences"
  ON public.class_session_occurrences FOR ALL TO authenticated
  USING ((SELECT public.is_staff()))
  WITH CHECK ((SELECT public.is_staff()));

CREATE POLICY "Read own reservations or staff"
  ON public.class_session_reservations FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()) OR (SELECT public.is_staff()));

CREATE POLICY "Students reserve own open enrolled sessions"
  ON public.class_session_reservations FOR INSERT TO authenticated
  WITH CHECK (
    student_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.class_session_occurrences o
      JOIN public.enrollments e ON e.class_id = o.class_session_id
      WHERE o.id = occurrence_id
        AND o.is_open
        AND e.student_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Students cancel own reservations"
  ON public.class_session_reservations FOR UPDATE TO authenticated
  USING (student_id = (SELECT auth.uid()) AND status = 'booked')
  WITH CHECK (student_id = (SELECT auth.uid()) AND status = 'cancelled');

CREATE POLICY "Staff manage reservations"
  ON public.class_session_reservations FOR ALL TO authenticated
  USING ((SELECT public.is_staff()))
  WITH CHECK ((SELECT public.is_staff()));

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

  SELECT * INTO occurrence_row
  FROM public.class_session_occurrences
  WHERE id = NEW.occurrence_id
  FOR UPDATE;

  IF NOT FOUND OR NOT occurrence_row.is_open THEN
    RAISE EXCEPTION 'این جلسه در حال حاضر برای رزرو باز نیست.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.class_sessions cs
    WHERE cs.id = occurrence_row.class_session_id
      AND cs.is_active
  ) THEN
    RAISE EXCEPTION 'این کلاس فعال نیست.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT (SELECT public.is_staff()) AND NOT EXISTS (
    SELECT 1
    FROM public.enrollments e
    WHERE e.class_id = occurrence_row.class_session_id
      AND e.student_id = NEW.student_id
  ) THEN
    RAISE EXCEPTION 'برای رزرو این جلسه ابتدا باید در کلاس ثبت‌نام کنید.'
      USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::integer INTO booked_count
  FROM public.class_session_reservations r
  WHERE r.occurrence_id = NEW.occurrence_id
    AND r.status = 'booked'
    AND r.id <> NEW.id;

  IF booked_count >= occurrence_row.capacity THEN
    RAISE EXCEPTION 'ظرفیت این جلسه تکمیل شده است.'
      USING ERRCODE = '23514';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION private.enforce_class_session_reservation()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER enforce_class_session_reservation
  BEFORE INSERT OR UPDATE OF occurrence_id, student_id, status
  ON public.class_session_reservations
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_class_session_reservation();

CREATE OR REPLACE FUNCTION private.prevent_capacity_below_bookings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  booked_count integer;
BEGIN
  IF NEW.capacity IS DISTINCT FROM OLD.capacity THEN
    SELECT count(*)::integer INTO booked_count
    FROM public.class_session_reservations r
    WHERE r.occurrence_id = OLD.id AND r.status = 'booked';

    IF NEW.capacity < booked_count THEN
      RAISE EXCEPTION 'ظرفیت جدید نمی‌تواند از تعداد رزروهای ثبت‌شده کمتر باشد.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION private.prevent_capacity_below_bookings()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER prevent_capacity_below_bookings
  BEFORE UPDATE OF capacity ON public.class_session_occurrences
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_capacity_below_bookings();
