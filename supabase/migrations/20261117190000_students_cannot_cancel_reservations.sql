-- Students cannot cancel their own reservations. They must report an absence
-- or request a staff-approved reschedule; the original booking stays active.
DROP POLICY IF EXISTS "Students cancel own reservations" ON public.class_session_reservations;
DROP POLICY IF EXISTS "Students manage own reservation state" ON public.class_session_reservations;

-- The legacy SECURITY DEFINER RPC independently allowed any signed-in student
-- to cancel a reservation, bypassing the table's RLS policies. Disable that
-- public API entry point as well. Staff continue to manage reservations through
-- their staff-only table policy; this does not grant students any new access.
REVOKE EXECUTE ON FUNCTION public.tonaliteh_cancel_reservation(uuid)
  FROM PUBLIC, anon, authenticated;

-- This migration intentionally does not alter existing reservations or attendance.
