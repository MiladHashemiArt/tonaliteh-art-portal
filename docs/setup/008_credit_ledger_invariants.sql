-- Tonaliteh 008: enforce append-only ledger semantics and allocation balance invariants.
-- This migration is intentionally separate from the initial schema foundation.
-- It does not install booking RPCs or change existing reservations/attendance.

begin;

-- A ledger row must reference the exact subscription and student that own its allocation.
alter table public.student_subscription_allocations
  add constraint student_subscription_allocations_id_student_subscription_unique
  unique (id, student_id, subscription_id);

alter table public.student_subscription_credit_ledger
  add constraint student_subscription_credit_ledger_allocation_owner_fk
  foreign key (allocation_id, student_id, subscription_id)
  references public.student_subscription_allocations (id, student_id, subscription_id)
  on delete restrict;

-- Protect historical financial records. Corrections are new compensating entries.
create or replace function public.tonaliteh_reject_credit_ledger_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  raise exception 'دفتر اعتبار غیرقابل ویرایش است؛ برای اصلاح، تراکنش جبرانی جدید ثبت کنید.';
end;
$function$;

revoke all on function public.tonaliteh_reject_credit_ledger_mutation() from public, anon, authenticated;

drop trigger if exists student_subscription_credit_ledger_immutable on public.student_subscription_credit_ledger;
create trigger student_subscription_credit_ledger_immutable
before update or delete on public.student_subscription_credit_ledger
for each row execute function public.tonaliteh_reject_credit_ledger_mutation();

-- Serialize all balance-changing inserts on the monthly allocation row.
-- This prevents two concurrent bookings from spending the same final credit and
-- prevents a release/adjustment from returning more credit than was consumed.
create or replace function public.tonaliteh_validate_credit_ledger_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_allocation public.student_subscription_allocations%rowtype;
  v_net_delta bigint;
begin
  select *
    into v_allocation
    from public.student_subscription_allocations a
   where a.id = new.allocation_id
     and a.student_id = new.student_id
     and a.subscription_id = new.subscription_id
   for update;

  if not found then
    raise exception 'سهمیه ماهانه متعلق به این هنرجو یا اشتراک نیست.';
  end if;

  if new.reason in ('booking_debit', 'booking_release')
     and (new.reservation_id is null or new.delta not in (-1, 1)) then
    raise exception 'تراکنش رزرو باید دقیقاً یک اعتبار کسر یا آزاد کند.';
  end if;

  if new.reason = 'booking_debit' and new.delta <> -1 then
    raise exception 'رزرو باید یک اعتبار از سهمیه کم کند.';
  end if;

  if new.reason = 'booking_release' then
    if new.delta <> 1 then
      raise exception 'آزادسازی رزرو باید یک اعتبار بازگرداند.';
    end if;
    if not exists (
      select 1
        from public.student_subscription_credit_ledger d
       where d.reservation_id = new.reservation_id
         and d.reason = 'booking_debit'
         and d.allocation_id = new.allocation_id
         and d.student_id = new.student_id
         and d.subscription_id = new.subscription_id
    ) then
      raise exception 'برای این رزرو کسر اعتبار متناظری وجود ندارد.';
    end if;
    if exists (
      select 1
        from public.student_subscription_credit_ledger r
       where r.reservation_id = new.reservation_id
         and r.reason = 'booking_release'
    ) then
      raise exception 'اعتبار این رزرو قبلاً آزاد شده است.';
    end if;
  end if;

  select coalesce(sum(l.delta), 0)::bigint
    into v_net_delta
    from public.student_subscription_credit_ledger l
   where l.allocation_id = new.allocation_id;

  -- A positive entry cannot make net consumption negative.
  if v_net_delta + new.delta > 0 then
    raise exception 'آزادسازی یا اصلاح اعتبار از میزان مصرف‌شده بیشتر است.';
  end if;

  -- A debit cannot exceed this month's quota.
  if v_net_delta + new.delta < -v_allocation.monthly_quota then
    raise exception 'اعتبار این ماه برای این رزرو کافی نیست.';
  end if;

  return new;
end;
$function$;

revoke all on function public.tonaliteh_validate_credit_ledger_insert() from public, anon, authenticated;

drop trigger if exists student_subscription_credit_ledger_validate_insert on public.student_subscription_credit_ledger;
create trigger student_subscription_credit_ledger_validate_insert
before insert on public.student_subscription_credit_ledger
for each row execute function public.tonaliteh_validate_credit_ledger_insert();

comment on function public.tonaliteh_validate_credit_ledger_insert() is
  'Serializes per-allocation ledger writes and rejects over-consumption, over-release, and unmatched reservation releases.';

commit;
