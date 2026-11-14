-- Keep the notification routine available to its table trigger only.
-- PostgreSQL does not require callers that modify the table to hold EXECUTE
-- on the trigger function; the trigger can continue to invoke it after revoke.
-- An empty search_path prevents object-shadowing attacks. All application
-- relations in the function body are already schema-qualified.
ALTER FUNCTION public.notify_students_on_class_closure()
  SET search_path = '';

REVOKE EXECUTE
  ON FUNCTION public.notify_students_on_class_closure()
  FROM PUBLIC, anon, authenticated, service_role;
