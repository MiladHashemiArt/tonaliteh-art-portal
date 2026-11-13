import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Camera, LockKeyhole, LogOut, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { useSignOut } from "@/components/app/AppShell";
import { PageHeader, Section } from "@/components/app/PageHeader";
import { ProfileAvatar, uploadProfilePhoto } from "@/components/app/ProfileAvatar";
import { ErrorState, LoadingRows, SetupNotice } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAppSession } from "@/hooks/use-app-session";
import { getOwnNationalId, setOwnNationalId, updateOwnProfile } from "@/lib/backend/auth";
import { friendlyError, profileQuery, qk } from "@/lib/backend/queries";
import type { ProfileRow } from "@/lib/backend/types";
import { formatDateFa } from "@/lib/domain/persian";
import {
  FULL_NAME_MAX,
  HOME_ADDRESS_MAX,
  maskNationalId,
  validateProfileForm,
  type ProfileForm,
  type ProfileFormErrors,
} from "@/lib/domain/profile";
import { homePathForRole, ROLE_LABEL } from "@/lib/domain/roles";
import { isValidNationalId } from "@/lib/domain/validation";

export const Route = createFileRoute("/app/profile")({
  head: () => ({
    meta: [
      { title: "پروفایل من | تنالیته" },
      { name: "description", content: "ویرایش اطلاعات تماس و نشانی در پنل تنالیته." },
    ],
  }),
  component: ProfilePage,
});

function toForm(p: ProfileRow | null | undefined): ProfileForm {
  return {
    fullName: p?.full_name ?? "",
    phone: p?.phone ?? "",
    homeAddress: p?.home_address ?? "",
  };
}

function ProfilePage() {
  const { user, role } = useAppSession();
  const profile = useQuery(profileQuery(user.id));
  const signOut = useSignOut();

  return (
    <>
      <PageHeader
        back={{ to: homePathForRole(role), label: "خانه" }}
        eyebrow="حساب کاربری"
        title="پروفایل من"
        description="اطلاعات تماس خود را به‌روز نگه دارید تا آموزشگاه در مواقع لازم با شما در ارتباط باشد."
      />

      <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <Section title="اطلاعات تماس">
          {profile.isPending ? (
            <LoadingRows rows={3} />
          ) : profile.error ? (
            <ErrorState error={profile.error} onRetry={() => profile.refetch()} />
          ) : !profile.data ? (
            <SetupNotice>
              پروفایل شما هنوز ساخته نشده است. چند لحظه بعد دوباره وارد شوید یا با مدیریت آموزشگاه
              تماس بگیرید.
            </SetupNotice>
          ) : (
            <ProfileEditForm profile={profile.data} />
          )}
        </Section>

        <aside className="space-y-10">
          <Section title="حساب">
            <dl className="surface divide-y divide-border text-sm">
              <div className="flex items-center justify-between gap-3 p-4">
                <dt className="text-muted-foreground">ایمیل</dt>
                <dd dir="ltr" className="truncate font-medium">
                  {user.email ?? "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 p-4">
                <dt className="text-muted-foreground">نقش</dt>
                <dd className="inline-flex items-center gap-1.5 font-medium">
                  <ShieldCheck className="size-4 text-bronze" aria-hidden />
                  {ROLE_LABEL[role]}
                </dd>
              </div>
              {profile.data?.created_at && (
                <div className="flex items-center justify-between gap-3 p-4">
                  <dt className="text-muted-foreground">عضویت از</dt>
                  <dd className="font-medium">{formatDateFa(profile.data.created_at)}</dd>
                </div>
              )}
            </dl>
            <p className="mt-3 text-xs leading-6 text-muted-foreground">
              نقش حساب فقط توسط مدیریت آموزشگاه تعیین می‌شود و از این صفحه قابل تغییر نیست.
            </p>
          </Section>

          {role === "student" && (
            <Section title="کد ملی">
              <NationalIdCard userId={user.id} />
            </Section>
          )}

          <Button variant="outline" className="w-full" onClick={signOut}>
            <LogOut /> خروج از حساب
          </Button>
        </aside>
      </div>
    </>
  );
}

function ProfileEditForm({ profile }: { profile: ProfileRow }) {
  const { user } = useAppSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [form, setForm] = useState<ProfileForm>(() => toForm(profile));
  const [errors, setErrors] = useState<ProfileFormErrors>({});
  const [photoBusy, setPhotoBusy] = useState(false);

  useEffect(() => setForm(toForm(profile)), [profile]);

  const initial = toForm(profile);
  const dirty =
    form.fullName !== initial.fullName ||
    form.phone !== initial.phone ||
    form.homeAddress !== initial.homeAddress;

  const save = useMutation({
    mutationFn: () => updateOwnProfile(user.id, form),
    onSuccess: (row) => {
      queryClient.setQueryData(qk.profile(user.id), row);
      // Refresh the header name, which reads the profile from the signed-in area.
      router.invalidate();
      toast.success("اطلاعات شما ذخیره شد.");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  async function changePhoto(file?: File) {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const path = await uploadProfilePhoto(user.id, file);
      queryClient.setQueryData(qk.profile(user.id), { ...profile, avatar_path: path });
      await queryClient.invalidateQueries({ queryKey: qk.allProfiles });
      router.invalidate();
      toast.success("تصویر پروفایل به‌روز شد.");
    } catch (error) {
      toast.error(friendlyError(error));
    } finally {
      setPhotoBusy(false);
    }
  }

  const set = (k: keyof ProfileForm) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="surface mb-5 flex flex-col items-center gap-3 p-5 text-center sm:flex-row sm:text-start">
      <ProfileAvatar path={profile.avatar_path} name={profile.full_name} className="size-24 ring-4 ring-bronze/10" fallbackClassName="text-3xl" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">تصویر پروفایل</p>
        <p className="mt-1 text-xs leading-6 text-muted-foreground">عکس شما فقط برای اعضای واردشدهٔ تنالیته نمایش داده می‌شود. JPG، PNG یا WebP تا ۵ مگابایت.</p>
        <label className="mt-2 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-border px-4 text-sm font-medium transition-colors hover:bg-accent">
          <Camera className="size-4" />
          {photoBusy ? "در حال بارگذاری…" : profile.avatar_path ? "تغییر عکس" : "انتخاب عکس"}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={photoBusy} onChange={(event) => { void changePhoto(event.target.files?.[0]); event.currentTarget.value = ""; }} />
        </label>
      </div>
    </div>
    <form
      className="surface space-y-5 p-5 sm:p-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const found = validateProfileForm(form);
        setErrors(found);
        if (Object.keys(found).length) return;
        save.mutate();
      }}
    >
      <Field id="pf-name" label="نام و نام خانوادگی" error={errors.fullName}>
        <Input
          id="pf-name"
          autoComplete="name"
          maxLength={FULL_NAME_MAX}
          value={form.fullName}
          onChange={set("fullName")}
          aria-invalid={!!errors.fullName}
          aria-describedby={errors.fullName ? "pf-name-err" : undefined}
        />
      </Field>
      <Field id="pf-phone" label="شمارهٔ تماس" error={errors.phone}>
        <Input
          id="pf-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          className="text-start"
          placeholder="۰۹۱۲۳۴۵۶۷۸۹"
          value={form.phone}
          onChange={set("phone")}
          aria-invalid={!!errors.phone}
          aria-describedby={errors.phone ? "pf-phone-err" : undefined}
        />
      </Field>
      <Field id="pf-address" label="نشانی کامل منزل" error={errors.homeAddress}>
        <Textarea
          id="pf-address"
          autoComplete="street-address"
          rows={3}
          maxLength={HOME_ADDRESS_MAX}
          value={form.homeAddress}
          onChange={set("homeAddress")}
          aria-invalid={!!errors.homeAddress}
          aria-describedby={errors.homeAddress ? "pf-address-err" : undefined}
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
    </div>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p id={`${id}-err`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Private to the student: read and written only through the owner-side private functions. */
function NationalIdCard({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const nid = useQuery({
    queryKey: qk.nationalId(userId),
    queryFn: getOwnNationalId,
    staleTime: 5 * 60_000,
  });
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();

  const save = useMutation({
    mutationFn: () => setOwnNationalId(value),
    onSuccess: () => {
      toast.success("کد ملی ذخیره شد.");
      setEditing(false);
      setValue("");
      queryClient.invalidateQueries({ queryKey: qk.nationalId(userId) });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  if (nid.isPending) return <LoadingRows rows={1} />;
  if (nid.error) return <ErrorState error={nid.error} onRetry={() => nid.refetch()} />;
  if (!nid.data.available)
    return (
      <SetupNotice>
        ثبت کد ملی هنوز فعال نشده است. پس از فعال‌سازی توسط مدیریت آموزشگاه، می‌توانید آن را همین‌جا
        وارد کنید.
      </SetupNotice>
    );

  const current = nid.data.value;
  return (
    <div className="surface space-y-4 p-5">
      <p className="flex items-start gap-2 text-xs leading-6 text-muted-foreground">
        <LockKeyhole className="mt-1 size-3.5 shrink-0 text-bronze" aria-hidden />
        کد ملی خصوصی است و فقط برای خود شما نمایش داده می‌شود.
      </p>
      {!editing ? (
        <div className="flex items-center justify-between gap-3">
          <span dir="ltr" className="font-medium tracking-widest">
            {current ? maskNationalId(current) : "ثبت نشده"}
          </span>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            {current ? "تغییر" : "ثبت کد ملی"}
          </Button>
        </div>
      ) : (
        <form
          className="space-y-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!isValidNationalId(value)) {
              setError("کد ملی معتبر نیست.");
              return;
            }
            setError(undefined);
            save.mutate();
          }}
        >
          <Label htmlFor="pf-nid">کد ملی ۱۰ رقمی</Label>
          <Input
            id="pf-nid"
            inputMode="numeric"
            autoComplete="off"
            dir="ltr"
            className="text-start"
            maxLength={12}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={!!error}
            autoFocus
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={save.isPending}>
              {save.isPending ? "در حال ذخیره…" : "ذخیره"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={save.isPending}
              onClick={() => {
                setEditing(false);
                setValue("");
                setError(undefined);
              }}
            >
              انصراف
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
