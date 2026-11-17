# Tonaliteh pre-Lovable readiness audit

Date: 2026-11-17  
Scope: read-only review of the current `main` source and the existing Supabase project. This document records verified observations and the next safe implementation steps. It does not authorize production database changes or deployment.

## Verified current state

### Application source

- The staff class-program page (`src/routes/app.staff.classes.tsx`) lets staff create, edit, activate, and deactivate recurring class templates, including multiple times per day and weekly / alternating-week recurrence.
- The student schedule page (`src/routes/app.student.schedule.tsx`) currently enrolls a student in weekly class templates. It is not a dated-session reservation calendar.
- The staff attendance page (`src/routes/app.staff.attendance.tsx`) selects a class template and date, then lets staff record attendance statuses. Its own UI says that an unrecorded status does not mean absence.
- The staff absence page (`src/routes/app.staff.absences.tsx`) lists advance absence reports.
- The student absence page supports reporting a date range against enrolled class templates.
- The backend already contains dated occurrence / reservation helpers in `src/lib/backend/sessions.ts`, and domain rules in `src/lib/domain/reservations.ts`. The route inventory under `src/routes` does not currently contain a dedicated student occurrence-reservation page or a staff occurrence-publication page.
- The occurrence helpers support publishing/opening a dated occurrence and closing/cancelling it. The student reservation helper prefers database RPCs for concurrency-safe booking.
- `createAdjustment` and `linkAdjustmentPayment` exist in the backend helper module for extra attendance charges, but the reviewed attendance page does not currently integrate those helpers into its workflow.
- Staff route access uses `isStaff`, which accepts both `teacher` and `manager`. The staff shell route redirects only non-staff users. This supports shared page access in the client; database policies still need independent role testing.

### Existing Supabase data (read-only query)

- The project currently has profile rows for one `manager` and one `student`; no `teacher` profile was present in the inspected profile-role counts.
- Nine class-template rows were found: six active and three inactive. Active rows include Tuesday and Friday 09:00–12:00 and 12:00–15:00, plus Thursday 09:00–12:00 and 12:00–15:00. The inactive rows are 15:00–18:00.
- `class_session_occurrences` currently contains zero rows.
- `class_session_reservations` currently contains zero rows.

### Database function observations

- `private.is_staff()` is SECURITY DEFINER, uses an empty search_path, and checks the authenticated profile role against `teacher` and `manager`.
- `tonaliteh_reserve_occurrence` locks the occurrence row, requires a signed-in user, rejects cancelled/unpublished/closed/past occurrences, verifies enrollment, and checks capacity before inserting/updating the caller's reservation.
- `tonaliteh_cancel_reservation` cancels only the caller's reservation and rejects past sessions.
- Both public reservation RPCs are SECURITY DEFINER. Their exact grants, surrounding RLS policies, and security-advisor warnings must be reviewed together before changing either function. Do not weaken or bypass RLS as a workaround.

## Implementation gaps to address

1. **Dated session publishing:** add a staff interface to create/publish a specific occurrence from a class template, set optional capacity, and open/close/cancel it.
2. **Student booking:** add a dated occurrence calendar/list that shows only published, open, non-cancelled future sessions and uses the locking reservation RPC. Preserve the existing weekly enrollment feature unless product decisions explicitly replace it.
3. **Staff roster:** show reservations for each occurrence to both teacher and manager, with live refresh / clear booked counts.
4. **Attendance integration:** connect the roster to dated occurrences and attendance records. Preserve the rule that missing attendance data must not silently become an absence.
5. **Absence notifications:** verify that a student's planned absence creates a notification visible to both staff roles, and avoid requiring manager approval.
6. **Extra attendance / overtime:** integrate the existing adjustment helpers into staff attendance, keep rates configured by staff, and never invent or automatically charge an unspecified rate.
7. **Independent staff permissions:** test teacher and manager separately for class templates, occurrence publication, attendance, absences, announcements, payments, and settings. Confirm students remain read-only for staff-only actions.
8. **Security review:** inspect all relevant RLS policies and exact security-advisor findings for the SECURITY DEFINER reservation functions. Only propose a migration after a precise review and explicit owner approval.

## Safe verification plan

- Add unit tests for occurrence state, capacity, reservation blockers, and recurrence edge cases.
- Add role-access tests for both `teacher` and `manager`, plus negative tests for `student`.
- Run the existing test, lint, typecheck (if configured), and production build scripts in a local/CI environment before merging.
- Use a separate test account for the teacher role; do not alter or promote a production profile merely to test.
- Do not execute SQL migrations, change RLS/policies, seed production occurrences, publish, deploy, or merge this audit branch without explicit review and approval.

## Boundaries

This is a documentation-only audit branch. No application source, database schema, RLS policy, production data, secrets, or deployment settings were changed by this audit.


## Additional reservation-safety finding (source review)

The current `src/lib/backend/sessions.ts` contains a fallback in `reserveOccurrence` and `cancelReservation`: when the RPC is missing (PostgREST `PGRST202` or PostgreSQL `42883`), it performs direct client-side reads and writes. The reservation fallback checks capacity before inserting, but that check and insert are not atomic. Two simultaneous requests can both observe a free seat and both insert. The SQL RPC in `docs/setup/005_session_reservations.sql` is specifically designed to lock the occurrence row and serialize booking; production booking must not silently fall back to the non-atomic client flow.

The cancellation fallback also directly updates the reservation row and relies entirely on table RLS; its behavior should not be treated as verified equivalent to the SQL RPC.

### Migration 005 review notes

The checked-in SQL file labels itself “REVIEW STEP 0 FIRST” and asks the owner to verify existing constraints, policies, triggers, and duplicate active reservations before applying. It adds a partial unique index and two SECURITY DEFINER RPCs, then grants execution to authenticated users. It does not alter RLS policies, but it is still a production schema/function change and must not be applied without the preflight checks and explicit owner approval.

Before using the RPC as the only booking path:
- Verify the function definitions and grants installed in the live database exactly match the reviewed migration (or a reviewed safer revision).
- Verify the partial unique index exists and there are no duplicate active reservations.
- Test simultaneous booking against a disposable test occurrence and verify capacity cannot be exceeded.
- Then remove the direct-write fallback so a missing RPC fails closed with a clear user-facing error.

No changes were made to `src/lib/backend/sessions.ts` or the database during this review.


## Live reservation RPC verification (2026-11-17)

A fresh read-only query against the existing Supabase project confirmed:
- Both `public.tonaliteh_reserve_occurrence(uuid)` and `public.tonaliteh_cancel_reservation(uuid)` are installed.
- Both are SECURITY DEFINER functions with an explicitly empty `search_path` setting.
- The `authenticated` role can execute both; `anon` cannot.
- The partial unique index `class_session_reservations_one_active` is not present.
- The current reservation table has zero duplicate active (occurrence, student) pairs.

This corrects the risk framing above: the non-atomic direct-write fallback is a latent application risk only if the RPC is missing or unavailable. The normal live path currently has both RPCs installed, and the reserve RPC's row lock serializes reservations for the same occurrence. The missing partial unique index is defense-in-depth and should be assessed against the actual live constraints and migration preflight before any production schema change. Do not infer that the current live booking path is already falling back.

The existing test suite already includes focused domain coverage in `src/test/sessions-attendance.test.ts` for recurrence, capacity, duplicate reservations, session states, capacity parsing, attendance roster, and extra attendance billing. It does not by itself test live database concurrency or independent teacher/manager RLS behavior.


### Live function body versus checked-in migration

Inspection of the live function definitions found additional safeguards not present in the checked-in `docs/setup/005_session_reservations.sql`:
- The live reserve RPC explicitly checks that the caller is enrolled in the class before booking. This is essential because SECURITY DEFINER bypasses RLS.
- The live reserve RPC counts rows with the exact active status `booked`, and comments that the live status CHECK allows only `booked` and `cancelled`.
- Both live functions rely on the existing `sync_class_session_booked_count` trigger to maintain `booked_count`; the checked-in migration instead updates the count directly.
- The live cancel RPC updates only the authenticated caller's reservation and rejects cancellation after the session date.

Therefore, the checked-in migration 005 is not an exact representation of the live production function bodies. Do not re-run or copy it over production as-is. First reconcile the migration against the live schema, constraints, and triggers; retain the enrollment guard and trigger-based count behavior.


## RLS and automatic attendance review (2026-11-17)

### Staff and student policy coverage

Read-only inspection of all current public-schema RLS policies shows a consistent `is_staff()` predicate on staff operations for class templates, dated occurrences, reservations, attendance, absences, announcements, payments, settings, artwork reviews, skill assessments, and student expenses. Since the live `private.is_staff()` helper checks both `teacher` and `manager`, both roles are included by these shared staff policies. Students have separate own-row or read-only policies in the reviewed areas.

Important caveat: policy expressions are role-based, but no live teacher profile was available for a true teacher-vs-manager authenticated integration test. Do not claim that end-to-end parity is proven until that test exists.

### Profile role escalation risk to review

The current `profiles` policies include `Staff manage profiles` with `ALL` and both USING and WITH CHECK set to `is_staff()`. The `profiles.role` column has a CHECK constraint limiting values to `student`, `teacher`, and `manager`, but the policy itself does not restrict which role a staff member may assign. This means any authenticated teacher/manager session that can update profiles may be able to promote a student or change another staff role. The student self-update policy separately keeps a student's own role as `student`, but it does not narrow the staff ALL policy.

This is a least-privilege concern, not a request to remove equal teacher/manager access. Before launch, review whether staff profile editing can be separated from role assignment, with role changes restricted to a trusted owner/admin path. Do not change the live policy without explicit owner approval and a migration reviewed against the app's profile-editing needs.

### Automatic attendance creation on booking

The live database has an `AFTER INSERT OR UPDATE OF status` trigger on `class_session_reservations` that creates an `attendance_records` row when a reservation becomes `booked`. It initializes status to:
- `prior_notice_absence` when a matching advance absence exists for the same student, class, and date;
- otherwise `pending`.

The insert is idempotent for the student/class/date key (`ON CONFLICT DO NOTHING`). A separate attendance trigger sends a notification to the student when a non-pending final attendance status is inserted or changed; it skips `pending` and `cancelled_session`. Thus attendance row creation is automated by reservation, but this is not automatic confirmation that a student physically attended. Staff still need to mark the final attendance status.

### Capacity enforcement trigger

The live reservation table also has a BEFORE INSERT/UPDATE trigger that locks the occurrence row, verifies the occurrence is open and not cancelled, confirms the class is active, checks student enrollment (unless the actor is staff), and checks capacity. This is additional live enforcement beyond the RPC body. Do not remove or bypass it when revising reservation code.

### New-student notifications

A profile INSERT trigger sends a `new_student` notification to existing teacher/manager profiles when a student profile is created. The notification path is present in the live database; actual delivery/UI visibility still needs end-to-end verification.

No live policies, triggers, functions, or profile data were modified during this review.


## Follow-up RLS, profile editing, and notification trigger review (2026-11-17)

### Profile role assignment

The live policy is exactly:
- `Staff manage profiles`: ALL, USING `is_staff()`, WITH CHECK `is_staff()`.
- `Students update own profile`: UPDATE, USING and WITH CHECK require own id and `role = 'student'`.
- `Read own profile or staff`: SELECT own row or `is_staff()`.

The reviewed profile UI (`src/routes/app.profile.tsx`) calls `updateOwnProfile(user.id, form)` and only edits full name, phone, and home address; its explanatory copy says role is not editable there. The staff student-list/detail UI reads profiles but the inspected sections do not expose a role editor. Thus the broad database policy is not currently needed for the visible profile-editing flow. It remains a backend privilege-escalation concern: a staff user's direct API request may be able to set another profile's role to `teacher` or `manager`. A safer future design is a narrowly scoped profile-update policy/RPC for ordinary fields and a separately authorized owner-only role-management operation. Preserve equal teacher/manager operational access; role assignment is a distinct privilege.

### Absence and announcement notification triggers

The live database has these triggers:
- New absence row -> `private.notify_staff_on_absence()`.
- New absence row -> `private.sync_attendance_from_absence_notice()`.
- New announcement -> `private.notify_students_on_announcement()`.
- Occurrence insert or change to `is_open` / `is_cancelled` -> `private.notify_class_session_occurrence_change()`.
- Capacity update -> `private.prevent_capacity_below_bookings()`.

This confirms database-side notification and synchronization hooks exist for the key workflows. It does not yet prove notification text, recipient selection, unread display, or end-to-end UI behavior; those functions and the notification page should be inspected and tested next.

### Confirmed policy behavior in reviewed tables

- Announcements: every authenticated user can SELECT; only `is_staff()` can manage rows.
- Absences: students can INSERT only their own absence; staff can manage; students/staff can read own/staff-visible rows.
- Notifications: users can read their own notifications (staff can read all via `is_staff()`) and users can update only their own notification rows.
- Dated occurrences: students can read open occurrences; staff can read/manage all.
- Reservations: students can insert their own reservation only when linked to an open occurrence and enrolled class; staff can manage; students can update their own reservation state but the live database triggers and RPC enforce open state, enrollment, and capacity.

No live policies, triggers, functions, rows, or profile roles were changed during this review.


## Student messaging and notification UX review (2026-11-17)

### Student message workflow: partial UI coverage

- The student route `src/routes/app.student.messages.tsx` provides a private conversation view for the signed-in student, sends messages to `student_messages`, refreshes every 20 seconds, and lets the student mark staff replies as read.
- The page copy says messages go to both teacher and management.
- The route inventory has no corresponding staff inbox / reply page. The database schema and policies permit staff to read the relevant conversations and insert replies, but the reviewed app route set does not currently provide a staff-facing UI for doing so.
- Therefore the student can send a message, but a complete in-app staff response workflow is not verified and appears incomplete. Add a shared staff inbox available to both teacher and manager, with per-student threads, unread indicators, reply composer, and mark-as-read behavior.

### Student message RLS findings

- INSERT policy restricts sender_id to auth.uid(); students can create only their own thread, while teacher/manager can reply only as themselves to a student's thread.
- UPDATE policy allows a student to mark staff replies in their own thread as read, and staff can mark their own replies as read.
- SELECT policy exists for authenticated users; its exact USING expression was not fully captured in the first query and must be explicitly re-read before launch. Do not assume the policy is appropriately scoped until verified.
- `student_messages` has no notification trigger in the inspected trigger inventory. Staff inbox should therefore poll/refresh or add a properly scoped notification mechanism after reviewing requirements.

### Notification UI findings

- The notifications route supports all/unread filters, marking one or all read, and requesting browser notification permission.
- It polls the notifications table every 60 seconds. The UI copy correctly notes that the app should remain open to receive device notifications; a granted browser permission alone is not proof of background push delivery.
- Announcement editing copy says edits do not send another notification; creating a new announcement does.
- Session open/close/cancel triggers create notifications for enrolled students. Cancellation also cancels booked reservations and changes pending/prior-notice attendance rows to cancelled_session.
- Absence triggers notify every profile whose role is teacher or manager; a student absence also synchronizes the attendance row when class_id is provided.

No app source, production data, RLS policies, or database triggers were changed during this review.


## Exact student-message RLS and notification delivery clarification (2026-11-17)

A follow-up read-only query captured the exact SELECT policy for `student_messages`:
`student_id = auth.uid() OR is current profile role teacher/manager`.
This means a student can read only their own conversation, while either staff role can read all student conversations. The INSERT policy requires `sender_id = auth.uid()` and allows either the student to write to their own thread or staff to reply to a student's thread. The UPDATE policy permits students to update read status on incoming staff messages in their own thread, and staff to update read status on their own replies. This is consistent with the intended shared staff inbox model; still add integration tests for cross-student denial and staff access.

The student notification page polls the database notification table and requests browser Notification permission. The inspected code does not register a push subscription or show a service-worker push handler; the UI itself tells users to keep Tonaliteh open. Treat this as in-app polling / foreground notification support, not verified background push delivery. If background push is required commercially, it needs a separately designed and tested push service.

The student message route polls every 20 seconds, but no staff inbox route was found in the current route inventory. Staff reply capability is permitted by RLS, but a user-facing staff reply workflow remains an application gap.

No code or production database changes were made in this follow-up.


## Student artwork portfolio and payment privacy review (2026-11-17)

### Student artwork portfolio

Source review of `src/routes/app.student.portfolio.tsx` and `src/routes/app.staff.portfolio.tsx` confirms:
- Students can upload artwork with title, optional description, and image.
- Client-side upload validation allows JPG, PNG, WebP and limits each file to 8 MiB.
- The live `student-artworks` storage bucket is private, has an 8 MiB limit, and allows only those three MIME types.
- Objects are stored under a per-student folder path; storage INSERT policy restricts students to their own folder.
- Storage SELECT policy allows the owner or staff; the app generates signed URLs valid for one hour rather than making the bucket public.
- Students can view and delete their own artwork; staff can review/read all student artwork and delete artwork files under the storage policies.
- Staff review history is append-only from the UI: a teacher/manager inserts a review row tied to their own authenticated reviewer_id. Students can read reviews attached to their own artworks.

This is a sound privacy-oriented baseline. Still test cross-student reads/deletes and staff access using real authenticated test accounts. Verify whether staff deletion of artwork rows and corresponding storage files is intentionally supported, since the staff UI reviewed here does not expose a delete action.

### Payments and account information

The live `payments` policies allow students to read their own payment rows and staff to read/manage all payment rows. Both teacher and manager are included through `is_staff()`. The app route for staff payments should be integration-tested separately for both roles.

### Remaining verification

- The policy query returned no rows for an additional guessed table name `student_payments`; do not treat that as proof of a missing payment feature. The canonical table is `payments`.
- Confirm student artwork RLS and private storage behavior with two student test identities; never use real student files for destructive tests.
- Confirm signed URLs expire and refresh cleanly in both student and staff views.
- Verify that deleting a student's artwork row and its storage object is resilient if one side of the operation fails; the current student UI deletes the database row first and then removes the object, so a storage failure may leave an orphaned file.

No live data, storage objects, RLS policies, or app source were modified during this review.


## Settings, payment display, and role-route review (2026-11-17)

### Settings permissions and editable content

The live `site_settings` RLS policies allow SELECT to all authenticated users and INSERT/UPDATE only when `is_staff()` is true. The live `private.is_staff()` helper includes both `teacher` and `manager`, so both roles have equal settings-write permission at the policy level.

The reviewed settings UI provides staff editing for:
- Teacher display name, phone, and Instagram (with validation and clickable preview).
- Group phone and address.
- Payment card number, card holder, bank name, IBAN, and payment notes. All payment fields are optional and validated when provided.
- Motivational quote and optional author. The footer has an edit dialog visible to staff roles.

The settings backend upserts only the keys passed by each form, preserving unrelated settings. No actual card or IBAN values are included in this audit.

### Student payment view

The student payment page queries the signed-in student's own payment history and shows the group payment information card. The staff payment route supports creating payment entries and changing their statuses. Database policy coverage for payments is staff-wide and student-own-row. End-to-end tests for teacher and manager accounts are still needed.

### Role-specific home routes

The app deliberately uses separate home routes:
- `/app/teacher` redirects non-teacher roles away.
- `/app/manager` redirects non-manager roles away.
Both routes render the same `StaffDashboard` component. This is a role-specific landing-page distinction, not evidence that staff operations require approval. Shared operational pages live under `/app/staff/*` and use the common staff guard.

### Open product gap

The settings page imports and defines `rate_extra_slot` and `rate_overtime_hour` in the domain model, but the reviewed settings UI does not currently expose these rate fields. The attendance/extra-time workflow should either add a staff-editable rate configuration or continue requiring the staff member to enter and confirm each charge explicitly. Never infer a rate or automatically charge when no rate is configured.

No app code, settings values, payment data, database policies, or production records were changed during this review.


## Finance and extra-attendance billing deep review (2026-11-17)

### Verified live finance behavior

- `payments` has student-own SELECT and staff-wide SELECT/ALL management policies. Both teacher and manager are included by the shared `is_staff()` helper.
- `attendance_adjustments` has student-own SELECT and staff SELECT/INSERT policies. Staff inserts must set `recorded_by = auth.uid()`; there is no student write policy.
- `attendance_records` has staff INSERT/UPDATE and student-own SELECT policies. A delete-prevention trigger blocks deletion; audit triggers record inserts/changes.
- Inserting an attendance adjustment automatically creates a linked `payments` row with status `pending`, payment type `extra_class`, and method `unknown`. This is a pending amount, not a payment collection or completed charge.
- The live validation trigger derives the rate from `site_settings`, verifies that the matching attendance row is `present`, calculates the amount, sets `recorded_by`, and rejects missing/non-positive rates. For extra time it calculates from minutes and an hourly rate; for an extra session it uses the configured session rate.
- If an attendance row is already `present` and has an adjustment, changing it away from `present` is blocked until the financial issue is handled.

### Critical application/database contract mismatch

The reviewed frontend domain/backend currently uses:
- Adjustment types: `extra_slot` and `overtime`.
- Settings keys from the domain model: `rate_extra_slot` and `rate_overtime_hour`.
- `createAdjustment` inserts the frontend row as supplied.

The live database trigger accepts only:
- `extra_session` and `extra_time`.
- Settings keys `extra_session_rate` and `extra_hourly_rate`.
- Extra time quantity in `quantity_minutes` (1–480), with amount calculated from the live hourly rate.

The frontend `ADJUSTMENT_COLUMNS` query does not select `quantity_minutes`, and the current domain model describes quantity in the UI as a decimal number of hours / generic units. This contract mismatch can cause extra attendance inserts to fail or rate settings to be ignored; it also risks presenting incorrect quantity/amount expectations. It must be reconciled before enabling or relying on extra-session/overtime billing in production. Do not patch only the UI labels: align types, settings keys, enum values, units, SQL constraints/triggers, and tests as one reviewed change.

### Payment workflow limits

- Staff can manually create payment rows with a student, amount, date, description, and status, and can change status among pending/paid/rejected.
- The student sees own payment history and the group transfer instructions.
- The app does not verify a bank transfer automatically. Staff status update is the confirmation mechanism in the reviewed route.
- No live finance rows were inserted/updated during this review.

### Recommended next implementation order

1. Reconcile extra attendance type/unit/settings contracts between frontend and live database in a test environment first.
2. Add tests for the database-trigger-created pending payment and the exact calculated amount.
3. Confirm adjustment cancellation/refund/accounting policy before allowing edits or reversals; the current audit trail prevents casual attendance deletion.
4. Test manager and teacher with separate authenticated accounts, and a student negative test.
5. Only after successful test-environment verification, prepare a reviewed migration or app release. No production schema, policies, functions, settings, or finance data were changed in this audit.


## Student balance and payment reconciliation review (2026-11-17)

### Student-facing payment calculation

Review of `src/routes/app.student.payments.tsx` shows that the page:
- Fetches only the signed-in student's payment rows through `myPaymentsQuery(user.id)`.
- Calculates and displays a single total for rows whose status is classified as success by `paymentStatusInfo`.
- Displays each payment amount, payment date, description, and status, plus the group transfer information card.

It does **not** calculate or display tuition due, outstanding balance, credits, overpayment, or a net student account balance. The paid total is a sum of successful payment rows only; it is not a debt calculation.

### Staff-facing financial summary

Review of `src/routes/app.staff.payments.tsx` and `src/lib/domain/payments.ts` shows that the staff page summarizes count and amount globally by the three app statuses (pending, paid, rejected), and supports searching payment rows by student name/phone/description. It does not group totals per student or reconcile payments against tuition invoices, enrollments, class attendance, or adjustments. The app's `summarizePayments` function is a status summary, not a student ledger/balance calculation.

### Live data snapshot

Read-only inspection of the live schema confirms:
- `payments` columns include student_id, amount, payment_date, status, description, payment_type, payment_method, and tracking_code.
- `attendance_adjustments` includes student_id, attendance_id, adjustment_type, quantity_minutes, unit_rate, amount, description, payment_id, and recorded_by.
- At the time of inspection, the live `payments` table contained 0 rows, across 0 students; `attendance_adjustments` contained 0 rows. Therefore no real student balance or historical debt could be reconciled from production data during this audit.
- The schema has no separately verified tuition invoice/obligation ledger in the reviewed payment workflow. A payment row alone cannot establish what a student owes unless the underlying charge/tuition obligation is also recorded.

### Required design decision before commercial launch

Do not label pending payment entries as confirmed debt or treat the paid-total display as an account balance. A reliable student ledger needs an explicit charge/obligation source (for example, tuition invoices and approved extra-class charges), linked payment allocations, and clear handling for pending, paid, rejected, refunded, and overpaid amounts. The automatic pending payment created by an attendance adjustment should be linked to the charge it settles; avoid double-counting it as both an adjustment and a separate charge.

Before implementing this, confirm the group's tuition model (fixed monthly/term tuition, per-session tuition, or another arrangement), due dates, and whether payments can be allocated partially across multiple charges. No production rows or schema were changed in this review.


## Tuition packages, flexible attendance, and schedule changes — product requirements (2026-11-17)

The tuition model is package-based, not a single fixed monthly fee and not a strict attendance-only billing model. The agreed starting options include 4-, 8-, and 12-session packages for a one-month period, with two-month and three-month package options also contemplated. Students choose their package first and then choose their preferred class days and time slots. Exact price amounts and detailed expiry/renewal rules are not recorded in this audit; do not invent them or substitute a different pricing model.

A purchased package must not rigidly prevent a student from attending more sessions than the package's initial allowance. For example, a student who selected a 4-session package may later decide to attend 6 or 8 sessions. The product must support, subject to the studio's rules and available capacity:
- Adding an extra session on the same day, including staying for the next class slot after the student's original slot.
- Booking an additional session on another day.
- Changing a previously selected class day or time slot.
- Moving/rescheduling a booking to another available session, with the system preserving an auditable record of the change.
- Showing the student and staff the difference between package allowance, sessions booked, sessions actually attended/consumed, remaining package balance, and additional sessions/charges.

Do not silently treat a schedule change as an extra paid session, and do not silently treat an extra attended session as included in the original package. The system needs explicit, staff-configurable business rules for when a reschedule returns a session credit, when a late cancellation/no-show consumes a credit, when an extra session is chargeable, and how any additional charge is approved/recorded. These rules must be visible to both student and staff before launch. A package credit, a reservation, a recorded attendance, and a financial charge are separate ledger events and must not be conflated or double-counted.

The package/ledger design should therefore support package purchase records, session-credit movements, dated reservations and rescheduling history, attendance consumption, approved extra-session charges, and payment allocations. Both teacher and manager must be able to administer the operational workflow independently; ordinary schedule changes and attendance decisions must not require the other staff role's approval. Students should be able to request or perform permitted changes within the published rules and available capacity.

These are product requirements to carry into implementation and acceptance tests, not claims that the current application already supports them. No app source or production database was changed by recording this requirement.
