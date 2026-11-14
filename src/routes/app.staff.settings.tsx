import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, Instagram, MapPin, Phone, Quote, UserRound } from "lucide-react";
import { toast } from "sonner";

import { PageHeader, Section } from "@/components/app/PageHeader";
import { PaymentInfoView } from "@/components/app/PaymentInfoCard";
import { ErrorState, LoadingRows, SetupNotice } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAppSession } from "@/hooks/use-app-session";
import { friendlyError, qk, settingsQuery } from "@/lib/backend/queries";
import { saveSettings } from "@/lib/backend/settings";
import { toPersianDigits } from "@/lib/domain/persian";
import { homePathForRole } from "@/lib/domain/roles";
import {
  GROUP_PAYMENT_KEYS,
  GROUP_PAYMENT_MAX,
  groupPaymentFromSettings,
  normalizeGroupPayment,
  validateGroupPayment,
  type GroupPaymentErrors,
  type GroupPaymentForm,
  type GroupPaymentKey,
  instagramHref,
  normalizeTeacherContact,
  TEACHER_CONTACT_KEYS,
  TEACHER_NAME_MAX,
  TEACHER_LOCATION_MAX,
  teacherContactFromSettings,
  telHref,
  validateTeacherContact,
  type Settings,
  type TeacherContactErrors,
  type TeacherContactForm,
  type TeacherContactKey,
} from "@/lib/domain/settings";

export const Route = createFileRoute("/app/staff/settings")({
  head: () => ({
    meta: [
      { title: "تنظیمات | تنالیته" },
      { name: "description", content: "ویرایش اطلاعات تماس استاد، آموزشگاه و اطلاعات واریز شهریه برای هنرجویان تنالیته." },
    ],
  }),
  component: StaffSettingsPage,
});

function StaffSettingsPage() {
  const { role } = useAppSession();
  const settings = useQuery(settingsQuery());

  return (
    <>
      <PageHeader
        back={{ to: homePathForRole(role), label: "خانه" }}
        eyebrow="مدیریت آموزشگاه"
        title="تنظیمات"
        description="اطلاعاتی که اینجا ذخیره می‌کنید در پنل هنرجویان نمایش داده می‌شود."
      />

      {settings.isPending ? (
        <LoadingRows rows={3} />
      ) : settings.error ? (
        <ErrorState error={settings.error} onRetry={() => settings.refetch()} />
      ) : settings.data.missing ? (
        <SetupNotice>
          جدول تنظیمات هنوز در پایگاه داده ساخته نشده است. اسکریپت راه‌اندازی تنظیمات باید یک‌بار
          توسط مدیر فنی اجرا شود.
        </SetupNotice>
      ) : (
        <>
          <TeacherContactSection values={settings.data.values} />
          <GroupPaymentSection values={settings.data.values} />
        </>
      )}

      <Section title="سایر تنظیمات">
        <div className="surface flex items-start gap-3 p-5 text-sm leading-7 text-muted-foreground">
          <Quote className="mt-1 size-4 shrink-0 text-bronze" aria-hidden />
          <p>جملهٔ انگیزشی پایین صفحه را از دکمهٔ «ویرایش» کنار همان جمله تغییر دهید.</p>
        </div>
      </Section>
    </>
  );
}

function TeacherContactSection({ values }: { values: Settings }) {
  const { user } = useAppSession();
  const queryClient = useQueryClient();
  const initial = teacherContactFromSettings(values);
  const [form, setForm] = useState<TeacherContactForm>(initial);
  const [errors, setErrors] = useState<TeacherContactErrors>({});

  // Re-sync when fresh values arrive from the database.
  const initialKey = TEACHER_CONTACT_KEYS.map((k) => initial[k]).join("\u0000");
  useEffect(() => {
    setForm(teacherContactFromSettings(values));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  const dirty = TEACHER_CONTACT_KEYS.some((k) => form[k] !== initial[k]);

  const save = useMutation({
    mutationFn: async () => {
      const clean = normalizeTeacherContact(form);
      await saveSettings(user.id, clean);
      return clean;
    },
    onSuccess: (clean) => {
      setForm(clean);
      queryClient.invalidateQueries({ queryKey: qk.settings });
      toast.success("اطلاعات تماس استاد ذخیره شد.");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const set = (k: TeacherContactKey) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const aria = (k: TeacherContactKey) => ({
    "aria-invalid": !!errors[k],
    "aria-describedby": errors[k] ? `${k}-err` : undefined,
  });

  return (
    <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
      <Section title="اطلاعات تماس استاد">
        <form
          className="surface space-y-5 p-5 sm:p-6"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const found = validateTeacherContact(form);
            setErrors(found);
            if (Object.keys(found).length) return;
            save.mutate();
          }}
        >
          <Field id="teacher_display_name" label="نام استاد" error={errors.teacher_display_name}>
            <Input
              id="teacher_display_name"
              autoComplete="off"
              maxLength={TEACHER_NAME_MAX}
              value={form.teacher_display_name}
              onChange={set("teacher_display_name")}
              {...aria("teacher_display_name")}
            />
          </Field>
          <Field id="teacher_phone" label="شمارهٔ تماس" error={errors.teacher_phone}>
            <Input
              id="teacher_phone"
              type="tel"
              inputMode="tel"
              dir="ltr"
              className="text-start"
              placeholder="09121234567"
              value={form.teacher_phone}
              onChange={set("teacher_phone")}
              {...aria("teacher_phone")}
            />
          </Field>
          <Field
            id="teacher_location"
            label="موقعیت / نشانی محل کلاس"
            hint="نشانی واقعی محل برگزاری کلاس را وارد کنید؛ هنرجو با لمس آن نقشه را باز می‌کند."
            error={errors.teacher_location}
          >
            <Textarea
              id="teacher_location"
              rows={2}
              maxLength={TEACHER_LOCATION_MAX}
              value={form.teacher_location}
              onChange={set("teacher_location")}
              {...aria("teacher_location")}
            />
          </Field>
          <Field
            id="teacher_instagram_url"
            label="اینستاگرام"
            hint="نشانی کامل صفحه یا نام کاربری با @"
            error={errors.teacher_instagram_url}
          >
            <Input
              id="teacher_instagram_url"
              type="url"
              inputMode="url"
              dir="ltr"
              className="text-start"
              placeholder="https://www.instagram.com/…"
              value={form.teacher_instagram_url}
              onChange={set("teacher_instagram_url")}
              {...aria("teacher_instagram_url")}
            />
          </Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {dirty && (
              <Button
                type="button"
                variant="ghost"
                disabled={save.isPending}
                onClick={() => {
                  setForm(initial);
                  setErrors({});
                }}
              >
                بازگردانی
              </Button>
            )}
            <Button type="submit" disabled={!dirty || save.isPending}>
              {save.isPending ? "در حال ذخیره…" : "ذخیرهٔ تغییرات"}
            </Button>
          </div>
        </form>
      </Section>

      <aside>
        <Section title="نمایش برای هنرجویان">
          <ContactPreview form={form} />
        </Section>
      </aside>
    </div>
  );
}

/** Live preview of the contact card; links are clickable only when the value is valid. */
function ContactPreview({ form }: { form: TeacherContactForm }) {
  const ig = instagramHref(form.teacher_instagram_url);
  const tel = telHref(form.teacher_phone);
  const name = form.teacher_display_name.trim();
  return (
    <div className="surface p-5">
      <p className="text-xs text-bronze">استاد</p>
      <p className="mt-1 flex items-center gap-2 font-display text-lg font-semibold">
        <UserRound className="size-4 text-bronze" aria-hidden />
        {name || "نام ثبت نشده"}
      </p>
      <ul className="mt-4 space-y-3 text-sm">
        <li>
          {tel ? (
            <a
              href={tel}
              className="inline-flex items-center gap-2 text-foreground hover:text-bronze"
            >
              <Phone className="size-4 text-bronze" aria-hidden />
              <span dir="ltr">{toPersianDigits(form.teacher_phone.trim())}</span>
            </a>
          ) : (
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <Phone className="size-4" aria-hidden /> شمارهٔ تماس ثبت نشده
            </span>
          )}
        </li>
        <li>
          {form.teacher_location.trim() ? (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(form.teacher_location.trim())}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-start gap-2 text-foreground hover:text-bronze"
            >
              <MapPin className="mt-0.5 size-4 shrink-0 text-bronze" aria-hidden />
              <span>{form.teacher_location.trim()}</span>
            </a>
          ) : (
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <MapPin className="size-4" aria-hidden /> موقعیت ثبت نشده
            </span>
          )}
        </li>
        <li>
          {ig ? (
            <a
              href={ig}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-2 text-foreground hover:text-bronze"
            >
              <Instagram className="size-4 shrink-0 text-bronze" aria-hidden />
              <span dir="ltr" className="truncate">
                {ig.replace(/^https?:\/\/(www\.)?/, "")}
              </span>
            </a>
          ) : (
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <Instagram className="size-4" aria-hidden /> اینستاگرام ثبت نشده
            </span>
          )}
        </li>
      </ul>
    </div>
  );
}

type GroupFieldDef = {
  key: GroupPaymentKey;
  label: string;
  hint?: string | undefined;
  placeholder?: string;
  ltr?: boolean;
  multiline?: boolean;
  inputMode?: "tel" | "numeric" | "text";
};

const GROUP_FIELDS: GroupFieldDef[] = [
  { key: "group_phone", label: "تلفن آموزشگاه", placeholder: "02112345678", ltr: true, inputMode: "tel" },
  { key: "group_address", label: "نشانی آموزشگاه", multiline: true },
];

const PAYMENT_FIELDS: GroupFieldDef[] = [
  {
    key: "payment_card_number",
    label: "شمارهٔ کارت",
    hint: "۱۶ رقم؛ با یا بدون خط تیره",
    placeholder: "0000-0000-0000-0000",
    ltr: true,
    inputMode: "numeric",
  },
  { key: "payment_card_holder", label: "نام صاحب حساب" },
  { key: "payment_bank_name", label: "نام بانک" },
  {
    key: "payment_iban",
    label: "شمارهٔ شبا",
    hint: "IR و ۲۴ رقم؛ می‌توانید فقط ۲۴ رقم را وارد کنید",
    placeholder: "IR00 0000 0000 0000 0000 0000 00",
    ltr: true,
  },
  {
    key: "payment_notes",
    label: "توضیحات واریز",
    hint: "مثلاً مهلت پرداخت یا ارسال رسید؛ برای هنرجویان نمایش داده می‌شود",
    multiline: true,
  },
];

function GroupPaymentSection({ values }: { values: Settings }) {
  const { user } = useAppSession();
  const queryClient = useQueryClient();
  const initial = groupPaymentFromSettings(values);
  const [form, setForm] = useState<GroupPaymentForm>(initial);
  const [errors, setErrors] = useState<GroupPaymentErrors>({});

  const initialKey = GROUP_PAYMENT_KEYS.map((k) => initial[k]).join("\u0000");
  useEffect(() => {
    setForm(groupPaymentFromSettings(values));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  const dirty = GROUP_PAYMENT_KEYS.some((k) => form[k] !== initial[k]);

  const save = useMutation({
    mutationFn: async () => {
      const clean = normalizeGroupPayment(form);
      await saveSettings(user.id, clean);
      return clean;
    },
    onSuccess: (clean) => {
      setForm(clean);
      queryClient.invalidateQueries({ queryKey: qk.settings });
      toast.success("اطلاعات آموزشگاه و پرداخت ذخیره شد.");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const renderField = (f: GroupFieldDef) => {
    const common = {
      id: f.key,
      value: form[f.key],
      maxLength: GROUP_PAYMENT_MAX[f.key],
      placeholder: f.placeholder,
      dir: f.ltr ? "ltr" : undefined,
      className: f.ltr ? "text-start" : undefined,
      "aria-invalid": !!errors[f.key],
      "aria-describedby": errors[f.key] ? `${f.key}-err` : undefined,
      onChange: (e: { target: { value: string } }) =>
        setForm((prev) => ({ ...prev, [f.key]: e.target.value })),
    };
    return (
      <Field key={f.key} id={f.key} label={f.label} hint={f.hint} error={errors[f.key]}>
        {f.multiline ? (
          <Textarea rows={3} {...common} />
        ) : (
          <Input autoComplete="off" inputMode={f.inputMode} {...common} />
        )}
      </Field>
    );
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const found = validateGroupPayment(form);
        setErrors(found);
        if (Object.keys(found).length) {
          toast.error("لطفاً موارد مشخص‌شده را اصلاح کنید.");
          return;
        }
        save.mutate();
      }}
    >
      <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <Section title="اطلاعات تماس آموزشگاه">
            <div className="surface space-y-5 p-5 sm:p-6">{GROUP_FIELDS.map(renderField)}</div>
          </Section>
          <Section title="اطلاعات واریز شهریه">
            <div className="surface space-y-5 p-5 sm:p-6">
              <p className="text-xs leading-6 text-muted-foreground">
                همهٔ موارد اختیاری‌اند. موردی را که نمی‌دانید خالی بگذارید؛ برای هنرجویان نمایش
                داده نمی‌شود.
              </p>
              {PAYMENT_FIELDS.map(renderField)}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                {dirty && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={save.isPending}
                    onClick={() => {
                      setForm(initial);
                      setErrors({});
                    }}
                  >
                    بازگردانی
                  </Button>
                )}
                <Button type="submit" disabled={!dirty || save.isPending}>
                  {save.isPending ? "در حال ذخیره…" : "ذخیرهٔ اطلاعات آموزشگاه و پرداخت"}
                </Button>
              </div>
            </div>
          </Section>
        </div>
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Section title="پیش‌نمایش برای هنرجویان">
            <div className="space-y-4">
              <GroupContactPreview form={form} />
              <PaymentInfoView values={form} />
              {dirty && (
                <p className="text-xs text-muted-foreground">
                  پیش‌نمایش تغییرات ذخیره‌نشده است.
                </p>
              )}
            </div>
          </Section>
        </aside>
      </div>
    </form>
  );
}

function GroupContactPreview({ form }: { form: GroupPaymentForm }) {
  const tel = telHref(form.group_phone);
  const address = form.group_address.trim();
  return (
    <div className="surface p-5">
      <p className="flex items-center gap-2 text-xs text-bronze">
        <Building2 className="size-4" aria-hidden /> آموزشگاه
      </p>
      <ul className="mt-3 space-y-3 text-sm">
        <li>
          {tel ? (
            <a href={tel} className="inline-flex items-center gap-2 text-foreground hover:text-bronze">
              <Phone className="size-4 text-bronze" aria-hidden />
              <span dir="ltr">{toPersianDigits(form.group_phone.trim())}</span>
            </a>
          ) : (
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <Phone className="size-4" aria-hidden /> تلفن آموزشگاه ثبت نشده
            </span>
          )}
        </li>
        <li className="flex items-start gap-2">
          <MapPin
            className={address ? "mt-1 size-4 shrink-0 text-bronze" : "mt-1 size-4 shrink-0 text-muted-foreground"}
            aria-hidden
          />
          <span className={address ? "leading-7" : "text-muted-foreground"}>
            {address || "نشانی ثبت نشده"}
          </span>
        </li>
      </ul>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string | undefined;
  error: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`${id}-err`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
