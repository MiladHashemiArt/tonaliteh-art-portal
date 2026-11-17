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
