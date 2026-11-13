import { useQuery } from "@tanstack/react-query";
import { Instagram, MapPin, Phone } from "lucide-react";

import { settingsQuery } from "@/lib/backend/queries";
import { toPersianDigits } from "@/lib/domain/persian";
import { instagramHref, telHref, teacherName } from "@/lib/domain/settings";

import { LoadingRows } from "./states";

export function ContactCard() {
  const settings = useQuery(settingsQuery());
  if (settings.isPending) return <LoadingRows rows={1} />;
  const v = settings.data?.values ?? {};
  const ig = instagramHref(v.teacher_instagram_url);
  const tel = telHref(v.teacher_phone);
  const groupTel = telHref(v.group_phone);
  const nothing = !ig && !tel && !groupTel && !v.group_address;

  return (
    <div className="surface p-5">
      <p className="text-xs text-bronze">استاد</p>
      <p className="mt-1 font-display text-lg font-semibold">{teacherName(v)}</p>
      <ul className="mt-4 space-y-2 text-sm">
        {ig && (
          <li>
            <a
              href={ig}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-foreground hover:text-bronze"
            >
              <Instagram className="size-4 text-bronze" aria-hidden /> اینستاگرام استاد
            </a>
          </li>
        )}
        {tel && v.teacher_phone && (
          <li>
            <a
              href={tel}
              className="inline-flex items-center gap-2 text-foreground hover:text-bronze"
            >
              <Phone className="size-4 text-bronze" aria-hidden />
              <span dir="ltr">{toPersianDigits(v.teacher_phone)}</span>
            </a>
          </li>
        )}
        {groupTel && v.group_phone && (
          <li>
            <a
              href={groupTel}
              className="inline-flex items-center gap-2 text-foreground hover:text-bronze"
            >
              <Phone className="size-4 text-bronze" aria-hidden /> آموزشگاه:{" "}
              <span dir="ltr">{toPersianDigits(v.group_phone)}</span>
            </a>
          </li>
        )}
        {v.group_address && (
          <li className="flex items-start gap-2 text-muted-foreground">
            <MapPin className="mt-1 size-4 shrink-0 text-bronze" aria-hidden /> {v.group_address}
          </li>
        )}
      </ul>
      {nothing && (
        <p className="mt-3 text-sm text-muted-foreground">راه‌های تماس هنوز ثبت نشده است.</p>
      )}
    </div>
  );
}
