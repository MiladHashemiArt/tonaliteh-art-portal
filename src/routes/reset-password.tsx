import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { Wordmark } from "@/components/brand/Wordmark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/backend/client";
import { friendlyError } from "@/lib/backend/queries";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "تغییر رمز عبور | تنالیته" },
      { name: "description", content: "تعیین رمز عبور تازه برای حساب تنالیته." },
      { property: "og:title", content: "تغییر رمز عبور | تنالیته" },
      { property: "og:description", content: "تعیین رمز عبور تازه برای حساب تنالیته." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState<"checking" | "ok" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady("ok");
    });
    supabase.auth.getSession().then(({ data: s }) => {
      if (s.session) setReady("ok");
      else setTimeout(() => setReady((r) => (r === "checking" ? "invalid" : r)), 2500);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("رمز عبور حداقل ۸ کاراکتر باشد.");
    if (password !== confirm) return setError("تکرار رمز یکسان نیست.");
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(friendlyError(err));
    toast.success("رمز عبور تغییر کرد.");
    navigate({ to: "/app", replace: true });
  }

  return (
    <div className="paper-grain flex min-h-dvh items-start justify-center bg-background px-5 pt-16">
      <div className="w-full max-w-md">
        <div className="text-center">
          <Wordmark className="text-5xl" />
          <h1 className="mt-2 text-lg font-semibold">رمز عبور تازه</h1>
        </div>
        <div className="surface mt-8 p-6">
          {ready === "checking" && (
            <p className="text-sm text-muted-foreground" role="status">
              در حال بررسی پیوند…
            </p>
          )}
          {ready === "invalid" && (
            <div className="space-y-4 text-sm">
              <p>این پیوند نامعتبر است یا منقضی شده است.</p>
              <Link to="/auth" search={{ mode: "forgot" }} className="text-bronze hover:underline">
                درخواست پیوند تازه
              </Link>
            </div>
          )}
          {ready === "ok" && (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="np">رمز عبور تازه</Label>
                <Input
                  id="np"
                  type="password"
                  dir="ltr"
                  className="text-start"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="npc">تکرار رمز عبور</Label>
                <Input
                  id="npc"
                  type="password"
                  dir="ltr"
                  className="text-start"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "در حال ذخیره…" : "ذخیرهٔ رمز تازه"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
