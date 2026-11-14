-- Store only an aggregate count on the occurrence row so students never need
-- a SECURITY DEFINER RPC to count other students' reservations.
ALTER TABLE public.class_session_occurrences
  ADD COLUMN booked_count integer NOT NULL DEFAULT 0 CHECK (booked_count >= 0);

UPDATE public.class_session_occurrences o
SET booked_count = (
  SELECT count(*)::integer
  FROM public.class_session_reservations r
  WHERE r.occurrence_id = o.id AND r.status = 'booked'
);

CREATE OR REPLACE FUNCTION private.sync_class_session_booked_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.class_session_occurrences o
    SET booked_count = (
      SELECT count(*)::integer FROM public.class_session_reservations r
      WHERE r.occurrence_id = OLD.occurrence_id AND r.status = 'booked'
    )
    WHERE o.id = OLD.occurrence_id;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.occurrence_id IS DISTINCT FROM NEW.occurrence_id THEN
    UPDATE public.class_session_occurrences o
    SET booked_count = (
      SELECT count(*)::integer FROM public.class_session_reservations r
      WHERE r.occurrence_id = OLD.occurrence_id AND r.status = 'booked'
    )
    WHERE o.id = OLD.occurrence_id;
  END IF;

  UPDATE public.class_session_occurrences o
  SET booked_count = (
    SELECT count(*)::integer FROM public.class_session_reservations r
    WHERE r.occurrence_id = NEW.occurrence_id AND r.status = 'booked'
  )
  WHERE o.id = NEW.occurrence_id;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION private.sync_class_session_booked_count()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS sync_class_session_booked_count ON public.class_session_reservations;
CREATE TRIGGER sync_class_session_booked_count
  AFTER INSERT OR UPDATE OR DELETE ON public.class_session_reservations
  FOR EACH ROW EXECUTE FUNCTION private.sync_class_session_booked_count();
DROP FUNCTION IF EXISTS public.get_open_class_session_booking_counts(date, date);