alter table public.payments drop constraint if exists payments_payment_type_check;
alter table public.payments
  add constraint payments_payment_type_check
  check (payment_type in ('tuition','materials','extra_class','other'));
comment on column public.payments.payment_type is 'Payment category: tuition, artistic supplies, extra class/time, or other with required explanation.';
