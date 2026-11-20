-- Prevent authenticated users (including teachers) from changing profile roles
-- through direct table updates. Role changes go through a manager-only RPC.
-- This migration preserves existing profile rows and profile creation trigger.

-- The public table currently has broad grants, including grants to anon.
REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT UPDATE (full_name, phone, home_address, avatar_path)
  ON TABLE public.profiles TO authenticated;

-- Replace the broad staff ALL policy with a narrowly scoped staff UPDATE policy.
DROP POLICY IF EXISTS "Staff manage profiles" ON public.profiles;
DROP POLICY IF EXISTS "Staff update profile details" ON public.profiles;
CREATE POLICY "Staff update profile details"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_staff()))
  WITH CHECK ((SELECT public.is_staff()));

-- Students retain their existing own-profile policy, but column privileges
-- prevent them from changing id, role, or created_at.

-- A private role predicate is used only by the manager-only role RPC.
CREATE OR REPLACE FUNCTION private.is_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND role = 'manager'
  );
$function$;

REVOKE ALL ON FUNCTION private.is_manager() FROM PUBLIC, anon;
-- The helper is called internally by the manager-only public RPC; it is not exposed directly.

-- Role changes are explicit, validated, and impossible for students/teachers.
CREATE OR REPLACE FUNCTION public.set_profile_role(_user_id uuid, _role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_manager() THEN
    RAISE EXCEPTION 'اجازه تغییر نقش کاربران را ندارید.'
      USING ERRCODE = '42501';
  END IF;

  IF _user_id IS NULL OR _role IS NULL OR _role NOT IN ('student', 'teacher', 'manager') THEN
    RAISE EXCEPTION 'شناسه یا نقش کاربر معتبر نیست.'
      USING ERRCODE = '22023';
  END IF;

  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'برای جلوگیری از قفل شدن حساب، تغییر نقش خودتان مجاز نیست.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
     SET role = _role
   WHERE id = _user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'کاربر موردنظر پیدا نشد.'
      USING ERRCODE = 'P0002';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_profile_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_profile_role(uuid, text) TO authenticated;
