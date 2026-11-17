# Reservation-to-credit transaction design

Status: engineering design only. This is not an executable migration and must not be applied to the live database.

## Existing behavior reviewed

- `docs/setup/005_session_reservations.sql` reserves an occurrence after checking that it is published/open, not cancelled, not in the past, and below capacity. It has no subscription-credit validation or ledger write.
- The same script currently permits student cancellation until the session date. This conflicts with the confirmed product rule and must be replaced: students cannot cancel a booked class themselves.
- `docs/setup/007_credit_ledger_and_makeups.sql` consumes one credit after finalized attendance, including present and both absence statuses. It is based on a missing 006 and a fixed `student_subscription_slots` mapping.
- The current design would risk double-debit if booking also debited credit without replacing the old attendance trigger.
- Current app types do not yet include subscription tables or a reservation-to-ledger relationship.

## Target invariant

For each ordinary reservation, exactly one monthly allocation credit is held/consumed, and every release/correction is auditable. Attendance marking must never debit the same reservation again. A student's available balance must never become negative, including under concurrent booking requests.

## Proposed transaction: reserve

Implement one private transactional function exposed through a narrowly granted RPC:

1. Require `auth.uid()`; derive student identity from the session, never from a caller-supplied student id.
2. Lock the occurrence row `FOR UPDATE`; validate published/open, not cancelled, date not past in Asia/Tehran, and capacity.
3. Check that the caller has no active reservation for this occurrence; rely on a partial unique index as a final race-condition guard.
4. Find the one active subscription allocation whose explicit Jalali period start/end contains the occurrence date. Do not match fixed class-session slots.
5. Lock that allocation row `FOR UPDATE`; calculate balance from the ledger for this allocation. Reject if no credit remains.
6. Insert/update the active reservation, write exactly one `-1` ledger debit with a unique idempotency key tied to reservation ID and event type, and link reservation to debit.
7. Update `booked_count` and return reservation ID. All steps commit or roll back together.

Lock order must be consistent across all RPCs (occurrence, then allocation) to reduce deadlocks. If a reservation row must be created before the debit, create it inside the same transaction; any failure rolls the row back.

## Confirmed rule: students cannot cancel reservations

- Remove/disable the student-facing cancellation action and revoke student execute permission on any cancellation RPC.
- A student who cannot attend submits a prior-absence notice against the reservation. The reservation remains active for accounting purposes and its original booking debit remains; the notice does not automatically release credit.
- A student who wants another day/session submits a reschedule request. The original reservation remains in force until the teacher approves the change.
- Only teacher/manager may cancel or move a reservation through a staff-authorized workflow. Any permitted staff cancellation must record actor, reason, timestamp, and audit trail. A staff cancellation that releases credit uses a compensating `+1` ledger entry, never mutation/deletion of the original debit.

## Proposed transaction: student absence notice and notifications

- Student submits an absence notice linked to the booked reservation, with date/time and optional explanation. The notice does not cancel the reservation or release its credit.
- Persist an auditable absence-notice record with status (submitted, acknowledged, makeup_pending, resolved) and created_at.
- On submission, create in-app notification records for both the teacher and manager. Deliver push notifications to both staff members' registered devices when push permission/token is available; notification delivery failure must not roll back the saved absence notice.
- Reschedule requests use a separate request type and status (pending, approved, rejected, completed). Notify both teacher and manager when the request is submitted; only teacher/manager can approve/reject. A teacher's decision does not require manager approval.
- On approval, atomically transfer the reservation to the target occurrence, verify capacity and eligibility, and preserve correct credit accounting. If the target occurrence falls in a different monthly allocation, lock both allocations in deterministic order, release the original debit and debit the target allocation in the same transaction; reject without partial changes if the target month has no available credit. If it is the same allocation, preserve the original debit and update the reservation link/date without charging again. Record both ledger entries with linked references and idempotency keys when a cross-allocation transfer occurs.
- Notify student, teacher, and manager of the decision and final schedule. Do not expose the change as approved until the transaction commits.

## Proposed transaction: staff cancellation of an occurrence

- Staff-only RPC; lock occurrence.
- Mark occurrence cancelled and close reservations.
- For each active reservation, append exactly one compensating credit entry referencing its debit. Use stable per-reservation idempotency keys.
- Send student notifications after state changes (within transaction via notifications table, or via reliable outbox if asynchronous delivery is introduced).
- Prevent a second cancellation call from issuing duplicate releases.

## Attendance and absence lifecycle

- Attendance records become an operational register, not a second billing trigger.
- Remove/replace the old `consume_subscription_credit_after_attendance` trigger as part of the same reviewed migration that introduces booking debits. Do not leave both paths active.
- A booked student who attends: no further debit.
- A booked student who submits prior notice or is a no-show: original booking debit remains. The teacher coordinates any make-up; the make-up is tied to the original charged absence and does not debit a second ordinary credit.
- A make-up session tied to an already charged absence must not debit another ordinary credit. It should reference the original absence/reservation and be auditable.
- An unreserved walk-in must use an explicit teacher/manager workflow, check capacity, and record whether it consumes a normal monthly credit or is billed as an extra session according to the selected staff action; it must never silently bypass capacity.

## Data model implications

- Subscription header: student, duration 1/2/3 months, arbitrary positive monthly quota, activation date, status, agreed price/discount snapshot, rollover policy.
- Monthly allocation: one row per Jalali period with explicit Gregorian `starts_on`/`ends_on` storage boundaries and monthly quota. Generate all period rows at activation, but make future periods unavailable until their start date.
- Ledger: append-only signed integer delta, allocation ID, student ID, reason, source type/ID, unique idempotency key, actor, timestamp, optional reversal reference.
- Reservation should store/reference the allocation and debit ledger entry (or a separate reservation-credit link table if circular FK ordering is undesirable).
- Enforce one active subscription allocation per student/date unless product later explicitly supports stacking packages. Avoid silently choosing among overlapping packages.

## Security and correctness requirements

- RLS for students to read only their own subscriptions, allocations, ledger and reservations; teacher and manager can manage all.
- Every privileged RPC validates authenticated user and staff role internally. If SECURITY DEFINER is used: set a fixed safe search_path, schema-qualify references, revoke PUBLIC/anon, grant only authenticated, and validate `auth.uid()`.
- Do not trust role values supplied by client or editable user metadata.
- Use row locks plus unique constraints; application-side balance checks alone are insufficient.
- Use append-only ledger entries. Corrections are compensating entries, never mutation/deletion.
- Keep monetary extra-time/extra-session adjustments separate from monthly ordinary class quota.
- Persist prices and discounts as purchase-time snapshots; never recalculate historical purchases from current settings.

## Required tests before merge/apply

1. Valid reservation spends one credit and increments count.
2. No active package, expired package, future allocation, exhausted allocation, closed/cancelled occurrence all reject without partial writes.
3. Two concurrent requests for the final credit: exactly one succeeds.
4. Duplicate retry with same idempotency key does not double-debit.
5. Duplicate active reservation rejected.
6. Student cancellation RPC is denied; no student action can cancel or release a reservation.
7. Prior-absence notice preserves the reservation and its debit, and creates notifications for both teacher and manager.
8. Reschedule request notifies teacher and manager; it cannot change the reservation before staff approval.
9. Approved same-allocation reschedule does not debit twice; cross-allocation transfer atomically moves credit and cannot create negative balance.
10. Rejected reschedule leaves the original reservation and ledger unchanged.
11. Staff occurrence cancellation releases each active reservation once.
12. Attendance present/absence does not debit a second time.
13. Make-up completion does not debit another ordinary credit.
14. Student cannot reserve or submit notices for another student.
15. Student cannot call staff cancellation/approval or alter another student's ledger.
16. Overlapping active subscriptions are rejected or handled by an explicitly defined selection policy.

## Decisions to confirm before implementation

- Current 005 rule allows student cancellation until the session date. Confirm that a cancellation made any time before the session date should return the credit in full.
- Recommended default: a booked no-show keeps the booking debit; a prior-notice absence should also keep it unless the teacher grants a make-up/credit adjustment. A teacher-cancelled session always releases the credit.
- Confirm whether a teacher/manager may create a walk-in reservation after a class begins, and whether that consumes a monthly credit or is always billed as an extra session.

## Repository review findings (2026-11-17)

The current one-off booking implementation was inspected against the target transaction above. The following are concrete integration gaps, not assumptions:

1. The student booking page writes directly to `class_session_reservations` with a client-side insert/update. It does not call a reservation-credit RPC and does not write a monthly ledger debit. The database trigger currently protects occurrence openness, class activity, enrollment, and capacity, but does not check a subscription allocation or credit balance.
2. The reservation migration grants authenticated users INSERT/UPDATE on the reservation table and originally adds a student UPDATE policy that permits changing their own row to `cancelled`. The focused student-cancellation migration removes that policy; it must be included in the final ordered migration set before enabling this workflow.
3. The student UI attempts to reactivate an existing cancelled reservation by updating it to `booked`. Once student UPDATE is revoked, that path will correctly fail. Rebooking policy must be explicit: either staff reactivates the existing row, or the schema changes to preserve history while allowing a new active reservation. Do not restore broad student UPDATE permission to solve this.
4. The unique constraint on `(occurrence_id, student_id)` allows only one reservation row ever for a student/occurrence, including cancelled history. This is compatible with staff reactivation but not with inserting a fresh reservation after cancellation. Decide the intended history model before implementing rebooking.
5. The existing occurrence trigger serializes bookings by locking the occurrence row and checks capacity. Preserve this lock in the future credit RPC; add the allocation lock after it, and enforce one active reservation with a database constraint/index.
6. The attendance creation trigger creates a pending attendance row when a reservation is booked. It must remain operational, but any legacy attendance-based credit-debit trigger must be removed in the same reviewed deployment that enables booking-time debits, or the student may be charged twice.
7. The UI still filters bookable occurrences by the student's fixed `enrollments` rows. That is inconsistent with the target monthly-subscription model if paid subscriptions are intended to grant booking eligibility without a separate manually-created enrollment. Replace this gate with the active subscription/allocation eligibility check in the same release as the credit RPC.
8. Client-side capacity display and date checks are only presentation safeguards. Database RPC/trigger logic remains authoritative for capacity, date, ownership, subscription period, and balance.

### Release gate

Do not enable monthly-credit reservations until all of the following ship together: subscription/allocation tables, append-only ledger and constraints, secure atomic reservation RPC, student UI switched to that RPC, enrollment-based UI gate replaced or formally retained by product decision, old attendance debit path retired, staff cancellation/rebooking rules implemented, and concurrency/RLS integration tests passing.
