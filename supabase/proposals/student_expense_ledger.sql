-- PROPOSAL ONLY — do not run against production until reviewed and approved.
-- Student-submitted expenses require staff approval. Every approved expense creates
-- exactly one linked pending payment; the ledger row is a breakdown, not a second balance.

CREATE TABLE IF NOT EXISTS public.student_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  submitted_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  category text NOT NULL CHECK (category IN ('materials', 'tools', 'photography', 'printing', 'transport', 'other')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  description text CHECK (description IS NULL OR char_length(description) <= 1000),
  amount numeric(14,0) NOT NULL CHECK (amount > 0 AND amount <= 1000000000000),
  expense_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  review_note text CHECK (review_note IS NULL OR char_length(review_note) <= 1000),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  payment_id uuid UNIQUE REFERENCES public.payments(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_expenses_review_state_check CHECK (
    (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL AND payment_id IS NULL)
    OR (status = 'approved' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
    OR (status = 'rejected' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND payment_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS student_expenses_student_date_idx
  ON public.student_expenses(student_id, expense_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS student_expenses_status_date_idx
  ON public.student_expenses(status, expense_date DESC);
CREATE INDEX IF NOT EXISTS student_expenses_submitted_by_idx
  ON public.student_expenses(submitted_by);

ALTER TABLE public.student_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students and staff read student expenses" ON public.student_expenses;
CREATE POLICY "Students and staff read student expenses"
  ON public.student_expenses FOR SELECT TO authenticated
  USING (student_id = (SELECT auth.uid()) OR (SELECT public.is_staff()));

DROP POLICY IF EXISTS "Students submit own pending expenses" ON public.student_expenses;
CREATE POLICY "Students submit own pending expenses"
  ON public.student_expenses FOR INSERT TO authenticated
  WITH CHECK (
    student_id = (SELECT auth.uid())
    AND submitted_by = (SELECT auth.uid())
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND payment_id IS NULL
  );

DROP POLICY IF EXISTS "Staff add approved student expenses" ON public.student_expenses;
CREATE POLICY "Staff add approved student expenses"
  ON public.student_expenses FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_staff())
    AND submitted_by = (SELECT auth.uid())
    AND status = 'approved'
    AND reviewed_by = (SELECT auth.uid())
    AND reviewed_at IS NOT NULL
    AND payment_id IS NULL
  );

DROP POLICY IF EXISTS "Staff review pending student expenses" ON public.student_expenses;
CREATE POLICY "Staff review pending student expenses"
  ON public.student_expenses FOR UPDATE TO authenticated
  USING ((SELECT public.is_staff()) AND status = 'pending')
  WITH CHECK (
    (SELECT public.is_staff())
    AND status IN ('approved', 'rejected')
    AND reviewed_by = (SELECT auth.uid())
    AND reviewed_at IS NOT NULL
  );

CREATE OR REPLACE FUNCTION private.guard_student_expense_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF public.is_staff() THEN
      IF NEW.submitted_by IS DISTINCT FROM auth.uid()
         OR NEW.status <> 'approved'
         OR NEW.reviewed_by IS DISTINCT FROM auth.uid()
         OR NEW.reviewed_at IS NULL
         OR NEW.payment_id IS NOT NULL THEN
        RAISE EXCEPTION 'هزینه مستقیم استاد باید با وضعیت تأییدشده ثبت شود.' USING ERRCODE = '42501';
      END IF;
    ELSE
      IF NEW.student_id IS DISTINCT FROM auth.uid()
         OR NEW.submitted_by IS DISTINCT FROM auth.uid()
         OR NEW.status <> 'pending'
         OR NEW.reviewed_by IS NOT NULL
         OR NEW.reviewed_at IS NOT NULL
         OR NEW.payment_id IS NOT NULL THEN
        RAISE EXCEPTION 'هنرجو فقط می‌تواند هزینه خودش را برای بررسی ارسال کند.' USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NOT public.is_staff() OR OLD.status <> 'pending'
       OR NEW.status NOT IN ('approved', 'rejected') THEN
      RAISE EXCEPTION 'فقط استاد یا مدیریت می‌تواند درخواست در انتظار را بررسی کند.' USING ERRCODE = '42501';
    END IF;
    IF (to_jsonb(NEW) - ARRAY['status','review_note','reviewed_by','reviewed_at','payment_id'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','review_note','reviewed_by','reviewed_at','payment_id']) THEN
      RAISE EXCEPTION 'اطلاعات اصلی هزینه پس از ارسال قابل تغییر نیست.' USING ERRCODE = '23514';
    END IF;
    NEW.reviewed_by := auth.uid();
    NEW.reviewed_at := now();
    NEW.payment_id := NULL;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION private.guard_student_expense_write()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS guard_student_expense_write ON public.student_expenses;
CREATE TRIGGER guard_student_expense_write
  BEFORE INSERT OR UPDATE OF student_id, submitted_by, category, title, description, amount, expense_date, status, review_note, reviewed_by, reviewed_at ON public.student_expenses
  FOR EACH ROW EXECUTE FUNCTION private.guard_student_expense_write();

CREATE OR REPLACE FUNCTION private.create_payment_for_approved_student_expense()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_payment_id uuid;
BEGIN
  IF NEW.status = 'approved'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    INSERT INTO public.payments (student_id, amount, payment_date, status, description)
    VALUES (
      NEW.student_id,
      NEW.amount,
      now(),
      'pending',
      'هزینه جانبی هنرجو · ' || NEW.title || ' · ' || NEW.expense_date::text
    )
    RETURNING id INTO v_payment_id;

    UPDATE public.student_expenses
    SET payment_id = v_payment_id
    WHERE id = NEW.id AND payment_id IS NULL;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION private.create_payment_for_approved_student_expense()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS create_payment_for_approved_student_expense ON public.student_expenses;
CREATE TRIGGER create_payment_for_approved_student_expense
  AFTER INSERT OR UPDATE OF status ON public.student_expenses
  FOR EACH ROW EXECUTE FUNCTION private.create_payment_for_approved_student_expense();

CREATE OR REPLACE FUNCTION private.notify_staff_on_student_expense()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_student_name text;
BEGIN
  SELECT coalesce(nullif(p.full_name, ''), 'هنرجو')
  INTO v_student_name
  FROM public.profiles p WHERE p.id = NEW.student_id;

  INSERT INTO public.notifications (user_id, title, body, notification_type, related_id)
  SELECT p.id,
         'درخواست هزینه تازه',
         v_student_name || ' هزینه «' || NEW.title || '» به مبلغ ' || NEW.amount::text || ' تومان ثبت کرده است.',
         'student_expense',
         NEW.id
  FROM public.profiles p
  WHERE p.role IN ('teacher', 'manager');
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION private.notify_staff_on_student_expense()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS notify_staff_on_student_expense ON public.student_expenses;
CREATE TRIGGER notify_staff_on_student_expense
  AFTER INSERT ON public.student_expenses
  FOR EACH ROW WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION private.notify_staff_on_student_expense();

CREATE OR REPLACE FUNCTION private.notify_student_on_expense_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_status_label text;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  v_status_label := CASE NEW.status WHEN 'approved' THEN 'تأیید شد' ELSE 'رد شد' END;

  INSERT INTO public.notifications (user_id, title, body, notification_type, related_id)
  VALUES (
    NEW.student_id,
    'وضعیت هزینه شما مشخص شد',
    'درخواست هزینه «' || NEW.title || '» ' || v_status_label ||
      CASE WHEN nullif(trim(NEW.review_note), '') IS NULL THEN '.' ELSE '؛ توضیح: ' || NEW.review_note END,
    'student_expense_review',
    NEW.id
  );
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION private.notify_student_on_expense_review()
  FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS notify_student_on_expense_review ON public.student_expenses;
CREATE TRIGGER notify_student_on_expense_review
  AFTER UPDATE OF status ON public.student_expenses
  FOR EACH ROW EXECUTE FUNCTION private.notify_student_on_expense_review();

GRANT SELECT, INSERT, UPDATE ON public.student_expenses TO authenticated;
