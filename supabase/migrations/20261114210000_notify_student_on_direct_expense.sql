CREATE OR REPLACE FUNCTION private.notify_student_on_expense_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_status_label text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;
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
  AFTER INSERT OR UPDATE OF status ON public.student_expenses
  FOR EACH ROW EXECUTE FUNCTION private.notify_student_on_expense_review();
