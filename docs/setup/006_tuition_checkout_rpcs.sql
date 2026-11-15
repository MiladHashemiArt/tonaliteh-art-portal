-- ============================================================================
-- Tonaliteh — secure tuition order creation and manual-transfer approval.
-- REVIEW ONLY. Do not apply to production until receipt storage policies,
-- gateway callback verification, and the student checkout UI are complete.
-- ============================================================================

-- Students must not write directly to active enrollments. Staff retain their
-- existing management policy; the approved-payment RPC below creates rows.
drop policy if exists "Students create own enrollments" on public.enrollments;

create or replace function public.create_tuition_order(p_class_session_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student uuid := auth.uid();
  v_count integer;
  v_amount bigint;
  v_single_enabled boolean;
  v_price text;
  v_old_price text;
  v_order_id uuid;
begin
  if v_student is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_class_session_ids is null then
    raise exception 'Select class sessions first' using errcode = '22023';
  end if;

  select count(distinct x)::integer into v_count
  from unnest(p_class_session_ids) as x
  where x is not null;

  if v_count not in (1, 4, 8, 12) or cardinality(p_class_session_ids) <> v_count then
    raise exception 'Choose exactly 1, 4, 8, or 12 distinct sessions' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_class_session_ids) as requested(id)
    left join public.class_sessions s on s.id = requested.id
    where s.id is null or s.is_active is not true
  ) then
    raise exception 'One or more selected sessions are unavailable' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_class_session_ids) as requested(id)
    join public.enrollments e
      on e.student_id = v_student and e.class_id = requested.id
  ) then
    raise exception 'One or more sessions are already enrolled' using errcode = '23505';
  end if;

  if v_count = 1 then
    select value into v_price from public.site_settings where key = 'single_session_price';
    if coalesce((select value from public.site_settings where key = 'single_session_enabled'), 'true') = 'false' then
      raise exception 'Single-session enrollment is disabled' using errcode = '22023';
    end if;
    v_amount := coalesce(nullif(v_price, '')::bigint, 750000);
  elsif v_count = 4 then
    select value into v_price from public.site_settings where key = 'package_4_price';
    v_amount := coalesce(nullif(v_price, '')::bigint, 3000000);
  elsif v_count = 8 then
    select value into v_price from public.site_settings where key = 'package_8_discount_price';
    select value into v_old_price from public.site_settings where key = 'package_8_price';
    v_amount := coalesce(nullif(v_price, '')::bigint, nullif(v_old_price, '')::bigint, 6000000);
  else
    select value into v_price from public.site_settings where key = 'package_12_discount_price';
    select value into v_old_price from public.site_settings where key = 'package_12_price';
    v_amount := coalesce(nullif(v_price, '')::bigint, nullif(v_old_price, '')::bigint, 9000000);
  end if;

  if v_amount <= 0 then
    raise exception 'Invalid tuition price configuration' using errcode = '22023';
  end if;

  insert into public.tuition_orders(student_id, session_count, amount_toman, price_snapshot)
  values (
    v_student,
    v_count,
    v_amount,
    jsonb_build_object('session_count', v_count, 'amount_toman', v_amount, 'calculated_at', now())
  )
  returning id into v_order_id;

  insert into public.tuition_order_sessions(order_id, class_session_id)
  select v_order_id, x
  from unnest(p_class_session_ids) as x;

  return v_order_id;
end;
$$;

create or replace function public.start_manual_tuition_payment(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student uuid := auth.uid();
  v_attempt_id uuid;
  v_order public.tuition_orders%rowtype;
begin
  if v_student is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select * into v_order
  from public.tuition_orders
  where id = p_order_id and student_id = v_student
  for update;

  if not found or v_order.status <> 'pending_payment' then
    raise exception 'Order is not available for payment' using errcode = '22023';
  end if;

  insert into public.tuition_payment_attempts(order_id, method, amount_toman)
  values (v_order.id, 'manual_transfer', v_order.amount_toman)
  returning id into v_attempt_id;

  return v_attempt_id;
end;
$$;

create or replace function public.submit_manual_tuition_receipt(
  p_payment_attempt_id uuid,
  p_receipt_object_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student uuid := auth.uid();
  v_order_id uuid;
begin
  if v_student is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_receipt_object_path is null
     or p_receipt_object_path !~ ('^' || v_student::text || '/[^/]+$') then
    raise exception 'Invalid receipt object path' using errcode = '22023';
  end if;

  select a.order_id into v_order_id
  from public.tuition_payment_attempts a
  join public.tuition_orders o on o.id = a.order_id
  where a.id = p_payment_attempt_id
    and a.method = 'manual_transfer'
    and a.status = 'initiated'
    and o.student_id = v_student
    and o.status = 'pending_payment'
  for update of a;

  if v_order_id is null then
    raise exception 'Payment attempt is not available' using errcode = '22023';
  end if;

  update public.tuition_payment_attempts
  set receipt_object_path = p_receipt_object_path,
      status = 'awaiting_review',
      submitted_at = now()
  where id = p_payment_attempt_id;

  update public.tuition_orders
  set status = 'awaiting_review', updated_at = now()
  where id = v_order_id;
end;
$$;

create or replace function public.review_manual_tuition_payment(
  p_payment_attempt_id uuid,
  p_approve boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.tuition_orders%rowtype;
  v_attempt public.tuition_payment_attempts%rowtype;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Staff access required' using errcode = '42501';
  end if;

  select a.* into v_attempt
  from public.tuition_payment_attempts a
  where a.id = p_payment_attempt_id and a.method = 'manual_transfer'
  for update;

  if not found or v_attempt.status <> 'awaiting_review' then
    raise exception 'Payment is not awaiting review' using errcode = '22023';
  end if;

  select * into v_order
  from public.tuition_orders
  where id = v_attempt.order_id
  for update;

  if v_order.status <> 'awaiting_review' then
    raise exception 'Order is not awaiting review' using errcode = '22023';
  end if;

  if not p_approve then
    update public.tuition_payment_attempts
    set status = 'rejected', verified_at = now(), verified_by = auth.uid()
    where id = p_payment_attempt_id;
    update public.tuition_orders
    set status = 'rejected', updated_at = now()
    where id = v_order.id;
    return;
  end if;

  update public.tuition_payment_attempts
  set status = 'paid', verified_at = now(), verified_by = auth.uid()
  where id = p_payment_attempt_id;

  update public.tuition_orders
  set status = 'paid', paid_at = now(), updated_at = now()
  where id = v_order.id;

  insert into public.enrollments(student_id, class_id)
  select v_order.student_id, os.class_session_id
  from public.tuition_order_sessions os
  where os.order_id = v_order.id
  on conflict (student_id, class_id) do nothing;

  insert into public.payments(
    student_id, amount, payment_date, status, description, payment_type, payment_method, tracking_code
  )
  values (
    v_order.student_id,
    v_order.amount_toman,
    now(),
    'paid',
    'شهریه سفارش ' || v_order.id::text,
    'tuition',
    'card_transfer',
    v_attempt.id::text
  );
end;
$$;

revoke all on function public.create_tuition_order(uuid[]) from public, anon;
revoke all on function public.start_manual_tuition_payment(uuid) from public, anon;
revoke all on function public.submit_manual_tuition_receipt(uuid, text) from public, anon;
revoke all on function public.review_manual_tuition_payment(uuid, boolean) from public, anon;
grant execute on function public.create_tuition_order(uuid[]) to authenticated;
grant execute on function public.start_manual_tuition_payment(uuid) to authenticated;
grant execute on function public.submit_manual_tuition_receipt(uuid, text) to authenticated;
grant execute on function public.review_manual_tuition_payment(uuid, boolean) to authenticated;
