-- Return aggregate reservation counts without exposing other students' identities.
CREATE OR REPLACE FUNCTION public.get_open_class_session_booking_counts(_from date, _to date)
RETURNS TABLE (occurrence_id uuid, booked_count integer, capacity integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT o.id,
         count(r.id)::integer,
         o.capacity
  FROM public.class_session_occurrences o
  LEFT JOIN public.class_session_reservations r
    ON r.occurrence_id = o.id AND r.status = 'booked'
  WHERE o.is_open
    AND o.session_date BETWEEN _from AND _to
    AND auth.uid() IS NOT NULL
  GROUP BY o.id, o.capacity;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_open_class_session_booking_counts(date, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_open_class_session_booking_counts(date, date)
  TO authenticated;