import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { supabase } from "@/lib/backend/client";
import { cn } from "@/lib/utils";

type Props = { path?: string | null | undefined; name?: string | null | undefined; className?: string; fallbackClassName?: string };

export function ProfileAvatar({ path, name, className, fallbackClassName }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!path) { setUrl(null); return; }
    supabase.storage.from("profile-photos").createSignedUrl(path, 60 * 60)
      .then(({ data, error }) => { if (alive) setUrl(error ? null : data?.signedUrl ?? null); })
      .catch(() => { if (alive) setUrl(null); });
    return () => { alive = false; };
  }, [path]);
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-bronze/20 bg-bronze-soft text-bronze shadow-sm", className)}>
      {url ? <img src={url} alt={name ? `تصویر پروفایل ${name}` : "تصویر پروفایل"} className="size-full object-cover" /> :
        name?.trim() ? <span className={cn("font-display font-semibold", fallbackClassName)}>{name.trim().charAt(0)}</span> :
        <UserRound className={cn("size-1/2", fallbackClassName)} aria-hidden />}
    </span>
  );
}

export async function uploadProfilePhoto(userId: string, file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("فرمت عکس باید JPG، PNG یا WebP باشد.");
  if (file.size > 5 * 1024 * 1024) throw new Error("حجم عکس نباید بیشتر از ۵ مگابایت باشد.");
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/avatar.${ext}`;
  const { error: uploadError } = await supabase.storage.from("profile-photos").upload(path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
  if (uploadError) throw uploadError;
  const { error: updateError } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", userId);
  if (updateError) throw updateError;
  return path;
}
