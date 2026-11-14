alter table public.payments
  add column if not exists payment_type text not null default 'other',
  add column if not exists payment_method text not null default 'unknown',
  add column if not exists tracking_code text;

alter table public.payments
  add constraint payments_payment_type_check
    check (payment_type in ('tuition','enrollment','materials','extra_class','other')),
  add constraint payments_payment_method_check
    check (payment_method in ('cash','card_transfer','pos','bank_transfer','other','unknown'));

comment on column public.payments.payment_type is 'Business category of the payment; legacy rows default to other.';
comment on column public.payments.payment_method is 'How the payment was received; never store full card or account numbers.';
comment on column public.payments.tracking_code is 'Optional bank reference or receipt tracking code; must not contain full card/account details.';
