-- Students cannot cancel their own reservations. They must report an absence
-- or request a staff-approved reschedule; the original booking stays active.
DROP POLICY IF EXISTS "Students cancel own reservations" ON public.class_session_reservations;
DROP POLICY IF EXISTS "Students manage own reservation state" ON public.class_session_reservations;

-- The existing staff-only management policy remains in place.
-- This migration intentionally does not alter existing reservations or attendance.
