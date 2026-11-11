import {
  Bell,
  CalendarDays,
  CalendarX2,
  CreditCard,
  Home,
  Megaphone,
  Settings,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { AppRole } from "@/lib/domain/roles";

export type NavItem = { to: string; label: string; icon: LucideIcon; exact?: boolean };

const STUDENT_NAV: NavItem[] = [
  { to: "/app/student", label: "خانه", icon: Home, exact: true },
  { to: "/app/student/schedule", label: "کلاس‌ها", icon: CalendarDays },
  { to: "/app/announcements", label: "اطلاعیه‌ها", icon: Megaphone },
  { to: "/app/student/absences", label: "غیبت", icon: CalendarX2 },
  { to: "/app/student/payments", label: "پرداخت‌ها", icon: CreditCard },
  { to: "/app/notifications", label: "اعلان‌ها", icon: Bell },
  { to: "/app/profile", label: "پروفایل", icon: UserRound },
];

const STAFF_NAV: NavItem[] = [
  { to: "/app/staff", label: "داشبورد", icon: Home, exact: true },
  { to: "/app/staff/students", label: "هنرجویان", icon: Users },
  { to: "/app/staff/classes", label: "کلاس‌ها", icon: CalendarDays },
  { to: "/app/announcements", label: "اطلاعیه‌ها", icon: Megaphone },
  { to: "/app/staff/absences", label: "غیبت‌ها", icon: CalendarX2 },
  { to: "/app/staff/payments", label: "پرداخت‌ها", icon: CreditCard },
  { to: "/app/notifications", label: "اعلان‌ها", icon: Bell },
  { to: "/app/staff/settings", label: "تنظیمات", icon: Settings },
  { to: "/app/profile", label: "پروفایل", icon: UserRound },
];

export function navFor(role: AppRole): NavItem[] {
  return role === "student" ? STUDENT_NAV : STAFF_NAV;
}

/** Up to four primary tabs on the phone bottom bar; the rest live under "more". */
export function mobileTabsFor(role: AppRole): NavItem[] {
  return navFor(role).slice(0, 4);
}

export function isActivePath(pathname: string, item: NavItem): boolean {
  const p = pathname.replace(/\/$/, "");
  return item.exact ? p === item.to : p === item.to || p.startsWith(item.to + "/");
}
