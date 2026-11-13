import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Instagram, Phone, Quote, UserRound } from "lucide-react";
import { toast } from "sonner";

import { PageHeader, Section } from "@/components/app/PageHeader";
import { ErrorState, LoadingRows, SetupNotice } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppSession } from "@/hooks/use-app-session";
import { friendlyError, qk, settingsQuery } from "@/lib/backend/queries";
import { saveSettings } from "@/lib/backend/settings";
import { toPersianDigits } from "@/lib/domain/persian";
import { homePathForRole } from "@/lib/domain/roles";
import {
  instagramHref,
  normalizeTeacherContact,
  TEACHER_CONTACT_KEYS,
  TEACHER_NAME_MAX,
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
      { name: "description", content: "ویرایش اطلاعات تماس استاد برای نمایش به هنرجویان تنالیته." },
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
        <TeacherContactSection values={settings.data.values} />
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

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
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
