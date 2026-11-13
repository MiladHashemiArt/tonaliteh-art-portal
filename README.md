# گروه هنری تنالیته

## Owner setup scripts (run manually in Supabase → SQL Editor, in order, after reviewing)
- `docs/setup/001_site_settings.sql` — site_settings table (staff-only writes).
- `docs/setup/002_role_guard_optional.sql` — optional: blocks role changes from the app.
- `docs/setup/003_private_national_id.sql` — private national_id column + own-row functions.
- `docs/setup/004_new_student_notification.sql` — notifies teacher/manager once per new student profile. Run its step-0 checks first; skip it if a similar trigger already exists.

Staff accounts: sign up normally, then set `profiles.role` to `teacher` or `manager` in the dashboard. Because they start as students, their own sign-up still sends one "new student" notice to existing staff.

Build the first real, polished, responsive web app/PWA for the Persian art school group "تنالیته" (Tonaliteh). This is a production-minded first version, not a static mockup.

IMPORTANT: Reuse and connect to the user's EXISTING Supabase project, not a new Lovable database:
Project ref: flaiwkxmlnjdqxlrvmpv
Project URL: https://flaiwkxmlnjdqxlrvmpv.supabase.co
Supabase publishable key: sb_publishable_6QyPUODV3LRGtsmf4l6O8g_YorayyQ8
Use Lovable's Supabase integration/connector workflow to connect this existing project. Do not create a separate database. If an owner-side OAuth confirmation is required, tell me exactly what the user must click; continue building UI and integration code meanwhile. Never put a service-role key in client code.

PRODUCT / BRAND:
- Persian RTL-first interface, beautiful refined Persian typography, elegant premium fine-art studio atmosphere.
- Palette: warm ivory/off-white, charcoal/ink, muted bronze/gold accents, subtle editorial spacing; tasteful artwork-inspired textures only where restrained. Avoid generic SaaS dashboard look.
- Brand name: تنالیته. Welcome copy in Persian. Do not show staff names on the role-choice landing cards.
- Teacher display name: محمد فرزانه. Manager display name: میلاد هاشمی.
- Mobile-first and excellent on iPhone Safari; desktop responsive too. Accessible contrast, keyboard support, loading/error/empty states.
- PWA installability where supported (manifest/icons/basic metadata); do not claim Android app is published.

LANDING / AUTH:
- Beautiful welcome screen with "تنالیته" prominent; login/entry options slightly below welcome text with generous standard spacing.
- Three role entry paths/cards: هنرجو, استاد, مدیریت. Do not reveal manager/teacher names in these choices.
- Real Supabase Auth email/password login and sign-up flows. Support password reset.
- Student registration fields: full name, phone, national ID (only if no schema field exists, clearly flag and add migration to public.profiles), and complete home address. Existing public.profiles columns currently include id, full_name, phone, role, created_at, home_address. national ID is not present: add a nullable national_id text column and keep it private; never expose it to other students.
- Auth trigger already creates profiles with full_name. After signup, update own profile with phone, home_address and national_id. Keep role student by default; never let public signup choose or elevate to teacher/manager.
- Staff role assignment must remain secure. Do not add a client-side role changer. If no staff users exist, provide a short setup note for owner to promote the manager/teacher accounts safely from Supabase Dashboard after they sign up. Manager/teacher names are display defaults, not proof of identity.

EXISTING SUPABASE TABLES (already present):
- profiles(id uuid auth user FK, full_name, phone, role, created_at, home_address); national_id absent, add it.
- class_sessions(id, class_day, start_time, end_time, class_type, session_date, is_active, recurrence_weeks, recurrence_anchor_date). Six rows already exist:
  Tuesday (سه‌شنبه) 09:00-12:00 and 12:00-15:00, class_type طراحی و رنگ, recurrence_weeks=1.
  Thursday (پنجشنبه) 09:00-12:00 and 12:00-15:00, class_type طراحی از مدل زنده, recurrence_weeks=2. recurrence_anchor_date is currently NULL; show this schedule as every other week and make anchor date editable only by staff.
  Friday (جمعه) 09:00-12:00 and 12:00-15:00, class_type طراحی و رنگ, recurrence_weeks=1.
- enrollments(student_id,class_id), unique student/class.
- announcements(id,title,content,created_by,created_at).
- absences(id,student_id,class_id nullable,absence_date,description,created_at).
- payments(id,student_id,amount,payment_date,status,description).
- notifications(id,user_id,title,body,notification_type,related_id,created_at,read_at). Triggers already create student notifications on new announcements and teacher/manager notifications on new absences.
- RLS is enabled. Student own-profile UPDATE policy now exists but must not allow changing role. Existing RLS controls staff actions; preserve them.
- security advisor currently returns no security lints.

CORE APP:
1. Student panel: profile view/edit; schedule and multi-select any number of class sessions; enroll/unenroll only own; enrollment list; submit absence request with date, optional class and explanation; view announcements and personal notifications; payment history/status; logout.
2. Teacher panel: dashboard; view students and their contact details needed for class administration (do not reveal national_id); manage class sessions and Thursday alternating-week anchor date; create/edit/delete announcements; review absences; view payment records; edit teacher contact profile details.
3. Management panel: same operational privileges as teacher plus manage student records and editable group settings/contact/payment details; only teacher and manager can create announcements. Students read-only.
4. Shared: notification inbox with mark-as-read, clear navigation/back affordance, logout, responsive navigation, bottom editable motivational quote.
5. Contact settings: teacher Instagram URL and phone number are configurable; render as clickable Instagram/tel links only when configured. Payment/card/account details are editable in management settings and display safely to students; do not invent actual values.
6. Teacher and manager can edit all operational sections per the requirements, but do not allow a user to self-promote roles.
7. Announcements should be readable by all authenticated users. Existing DB trigger creates notifications for all students; use it rather than duplicate notifications from the client. Absence trigger notifies staff; use it.
8. Student profile form must never show national_id to other students or teacher/manager unless there is a legitimate explicit need; default to private to the student and management only if required. Do not put national_id in broad student lists.

IMPLEMENTATION:
- First inspect actual connected Supabase schema and RLS policies before changing them. Use existing tables and policies; do not drop tables or weaken RLS. Add only the minimal migration needed for national_id and any app settings table if necessary. Any new table must have RLS and secure policies.
- Build a clean reusable component structure and typed Supabase client using Vite/React/TypeScript and Tailwind/shadcn appropriate to Lovable.
- Implement route guards based on authenticated session and profiles.role. Never trust local role selection as authorization; verify role from Supabase.
- Ensure no secrets/service role key are shipped to browser. Handle missing staff profiles gracefully.
- Include an initial README/setup note explaining staff role assignment, required Supabase redirect URLs, and how to preview/test.
- Test build/typecheck and fix errors before reporting.
- Do not publish/deploy yet; provide editor and preview links once available.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/ff7fce75-6771-4e01-bb13-2039f0080abc).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
