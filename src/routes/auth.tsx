import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Eye, EyeOff, MailCheck } from "lucide-react";
import { toast } from "sonner";

import { Wordmark } from "@/components/brand/Wordmark";
import { SetupNotice } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveOwnProfileDetails } from "@/lib/backend/auth";
import { backendConfigured, supabase } from "@/lib/backend/client";
import { friendlyError, profileQuery } from "@/lib/backend/queries";
import { homePathForRole, normalizeRole, ROLE_LABEL, type AppRole } from "@/lib/domain/roles";
import { isValidPhone, normalizeDigits } from "@/lib/domain/validation";
import { cn } from "@/lib/utils";

type Mode = "signin" | "signup" | "forgot";
type AuthSearch = { role?: AppRole; mode?: Mode; redirect?: string };

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): AuthSearch => {
    const out: AuthSearch = {};
    if (s["role"] === "student" || s["role"] === "teacher" || s["role"] === "manager")
      out.role = s["role"];
    if (s["mode"] === "signin" || s["mode"] === "signup" || s["mode"] === "forgot")
      out.mode = s["mode"];
    if (typeof s["redirect"] === "string") out.redirect = s["redirect"];
    return out;
  },
  head: () => ({
    meta: [
      { title: "ورود و ثبت‌نام | تنالیته" },
      { name: "description", content: "ورود به حساب یا ثبت‌نام هنرجوی تازه در گروه هنری تنالیته." },
      { property: "og:title", content: "ورود و ثبت‌نام | تنالیته" },
      { property: "og:description", content: "ورود به حساب یا ثبت‌نام هنرجوی تازه در گروه هنری تنالیته." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

/** Only same-app paths are allowed as a post-login destination. */
function safeRedirect(target: string | undefined): string | null {
  if (!target) return null;
  try {
    const url = new URL(target, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/app")) return null;
    return url.pathname + url.search;
  } catch {
    return null;
  }
}

function AuthPage() {
  const search = Route.useSearch();
  const chosen: AppRole = search.role ?? "student";
  const staffPath = chosen !== "student";
  const mode: Mode = search.mode ?? "signin";
  const navigate = useNavigate();

  const setMode = (m: Mode) =>
    navigate({ to: "/auth", search: { ...search, mode: m }, replace: true });

  return (
    <div className="paper-grain flex min-h-dvh flex-col bg-background">
      <div className="mx-auto w-full max-w-md flex-1 px-5 pb-16 pt-8">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowRight className="size-4" aria-hidden /> صفحهٔ نخست
        </Link>

        <div className="mt-8 text-center animate-rise">
          <Wordmark className="text-5xl" />
          <p className="mt-2 text-sm text-muted-foreground">
            ورود {ROLE_LABEL[chosen]}
          </p>
        </div>

        {!backendConfigured && (
          <div className="mt-6">
            <SetupNotice>اتصال سامانه هنوز تنظیم نشده است. لطفاً با مدیریت تماس بگیرید.</SetupNotice>
          </div>
        )}

        {mode !== "forgot" && !staffPath && (
          <div role="tablist" aria-label="ورود یا ثبت‌نام" className="mt-8 grid grid-cols-2 rounded-full border border-border bg-card p-1">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  "h-10 rounded-full text-sm transition-colors",
                  mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "signin" ? "ورود" : "ثبت‌نام هنرجو"}
              </button>
            ))}
          </div>
        )}

        <div className="surface mt-6 p-5 sm:p-7 animate-rise">
          {mode === "forgot" ? (
            <ForgotForm onBack={() => setMode("signin")} />
          ) : mode === "signup" && !staffPath ? (
            <SignupForm />
          ) : (
            <SigninForm chosen={chosen} redirectTo={search.redirect} onForgot={() => setMode("forgot")} />
          )}
        </div>

        {staffPath && mode !== "forgot" && (
          <p className="mt-6 text-center text-xs leading-6 text-muted-foreground">
            دسترسی کادر آموزشی فقط پس از تأیید نقش در سامانه فعال می‌شود و با انتخاب این گزینه
            تغییر نمی‌کند.
          </p>
        )}
      </div>
    </div>
  );
}

function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} dir="ltr" className="pe-11 text-start" />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute inset-y-0 end-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
        aria-label={show ? "پنهان کردن رمز" : "نمایش رمز"}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function SigninForm({
  chosen,
  redirectTo,
  onForgot,
}: {
  chosen: AppRole;
  redirectTo: string | undefined;
  onForgot: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { data, error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err) throw err;
      // Role comes from the profiles table, never from the card the user picked.
      const profile = await queryClient.fetchQuery(profileQuery(data.user.id));
      const role = normalizeRole(profile?.role);
      if (chosen !== "student" && role !== chosen) {
        toast.info(`حساب شما با نقش «${ROLE_LABEL[role]}» ثبت شده است.`);
      }
      const target = safeRedirect(redirectTo);
      navigate({ to: target ?? homePathForRole(role), replace: true });
    } catch (e2) {
      setError(friendlyError(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">ایمیل</Label>
        <Input
          id="email"
          type="email"
          dir="ltr"
          className="text-start"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">رمز عبور</Label>
          <button type="button" onClick={onForgot} className="text-xs text-bronze hover:underline">
            فراموشی رمز
          </button>
        </div>
        <PasswordInput
          id="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" size="lg" disabled={busy || !email || !password}>
        {busy ? "در حال ورود…" : "ورود"}
      </Button>
    </form>
  );
}

type SignupErrors = Partial<Record<"fullName" | "email" | "phone" | "address" | "password" | "confirm", string>>;

function SignupForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [f, setF] = useState({ fullName: "", email: "", phone: "", address: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<SignupErrors>({});
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((v) => ({ ...v, [k]: e.target.value }));

  function validate(): SignupErrors {
    const out: SignupErrors = {};
    if (f.fullName.trim().length < 3) out.fullName = "نام و نام خانوادگی را کامل بنویسید.";
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) out.email = "ایمیل معتبر وارد کنید.";
    if (!isValidPhone(f.phone)) out.phone = "شمارهٔ تماس معتبر وارد کنید (مثلاً ۰۹۱۲۳۴۵۶۷۸۹).";
    if (f.address.trim().length < 10) out.address = "نشانی کامل منزل را بنویسید.";
    if (f.password.length < 8) out.password = "رمز عبور حداقل ۸ کاراکتر باشد.";
    if (f.confirm !== f.password) out.confirm = "تکرار رمز با رمز عبور یکسان نیست.";
    return out;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const v = validate();
    setErrors(v);
    if (Object.keys(v).length) return;
    setBusy(true);
    try {
      const phone = normalizeDigits(f.phone);
      // No role is sent: the database trigger creates every public sign-up as a student.
      const { data, error } = await supabase.auth.signUp({
        email: f.email.trim(),
        password: f.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth`,
          data: {
            full_name: f.fullName.trim(),
            phone,
            home_address: f.address.trim(),
            tonaliteh_pending: true,
          },
        },
      });
      if (error) throw error;
      if (data.session && data.user) {
        await saveOwnProfileDetails(data.user.id, {
          fullName: f.fullName,
          phone,
          homeAddress: f.address,
        }).catch(() => undefined);
        await supabase.auth.updateUser({ data: { tonaliteh_pending: false } });
        await queryClient.invalidateQueries({ queryKey: ["profile", data.user.id] });
        toast.success("ثبت‌نام انجام شد. خوش آمدید!");
        navigate({ to: "/app/student", replace: true });
      } else {
        setSentTo(f.email.trim());
      }
    } catch (e2) {
      setFormError(friendlyError(e2));
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center" role="status">
        <MailCheck className="size-10 text-bronze" aria-hidden />
        <h2 className="text-lg font-semibold">ایمیل خود را بررسی کنید</h2>
        <p className="text-sm leading-7 text-muted-foreground">
          پیوند تأیید به <span dir="ltr" className="font-medium text-foreground">{sentTo}</span>{" "}
          فرستاده شد. پس از تأیید، وارد شوید تا اطلاعات تماس شما در پروفایل ثبت شود.
        </p>
      </div>
    );
  }

  const field = (
    id: keyof SignupErrors,
    label: string,
    input: React.ReactNode,
    hint?: string,
  ) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {input}
      {errors[id] ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {errors[id]}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );

  const aria = (id: keyof SignupErrors) =>
    errors[id] ? { "aria-invalid": true, "aria-describedby": `${id}-error` } : {};

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {field(
        "fullName",
        "نام و نام خانوادگی",
        <Input id="fullName" autoComplete="name" value={f.fullName} onChange={set("fullName")} {...aria("fullName")} />,
      )}
      {field(
        "email",
        "ایمیل",
        <Input id="email" type="email" dir="ltr" className="text-start" autoComplete="email" inputMode="email" value={f.email} onChange={set("email")} {...aria("email")} />,
      )}
      {field(
        "phone",
        "شمارهٔ تماس",
        <Input id="phone" type="tel" dir="ltr" className="text-start" autoComplete="tel" inputMode="tel" value={f.phone} onChange={set("phone")} {...aria("phone")} />,
      )}
      {field(
        "address",
        "نشانی کامل منزل",
        <Textarea id="address" autoComplete="street-address" value={f.address} onChange={set("address")} {...aria("address")} />,
      )}

      <fieldset className="rounded-xl border border-dashed border-border bg-muted/50 p-4">
        <legend className="px-1 text-xs font-medium text-muted-foreground">کد ملی (اختیاری)</legend>
        <Input id="nationalId" disabled placeholder="به‌زودی" aria-describedby="nid-note" dir="ltr" className="text-start" />
        <p id="nid-note" className="mt-2 text-xs leading-6 text-muted-foreground">
          این بخش هنوز فعال نیست و هیچ اطلاعاتی در آن ذخیره نمی‌شود. پس از آماده شدن سامانه، از
          پروفایل خود می‌توانید آن را تکمیل کنید.
        </p>
      </fieldset>

      {field(
        "password",
        "رمز عبور",
        <PasswordInput id="password" autoComplete="new-password" value={f.password} onChange={set("password")} {...aria("password")} />,
        "حداقل ۸ کاراکتر",
      )}
      {field(
        "confirm",
        "تکرار رمز عبور",
        <PasswordInput id="confirm" autoComplete="new-password" value={f.confirm} onChange={set("confirm")} {...aria("confirm")} />,
      )}
      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}
      <Button type="submit" className="w-full" size="lg" disabled={busy}>
        {busy ? "در حال ثبت‌نام…" : "ساخت حساب هنرجو"}
      </Button>
    </form>
  );
}

function ForgotForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (err) setError(friendlyError(err));
    else setSent(true);
  }

  return (
    <div>
      <h2 className="text-lg font-semibold">بازیابی رمز عبور</h2>
      {sent ? (
        <p className="mt-3 text-sm leading-7 text-muted-foreground" role="status">
          اگر حسابی با این ایمیل وجود داشته باشد، پیوند تغییر رمز برایتان فرستاده شد.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reset-email">ایمیل</Label>
            <Input id="reset-email" type="email" dir="ltr" className="text-start" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy || !email}>
            {busy ? "در حال ارسال…" : "ارسال پیوند تغییر رمز"}
          </Button>
        </form>
      )}
      <button type="button" onClick={onBack} className="mt-4 text-sm text-bronze hover:underline">
        بازگشت به ورود
      </button>
    </div>
  );
}
