# Reservation-to-credit transaction design

Status: engineering design only. This is not an executable migration and must not be applied to the live database.

## Existing behavior reviewed

- `docs/setup/005_session_reservations.sql` reserves an occurrence after checking that it is published/open, not cancelled, not in the past, and below capacity. It has no subscription-credit validation or ledger write.
- The same script permits student cancellation until the session date (it rejects cancellation only after the date has passed).
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

## Proposed transaction: student cancellation

- Keep the existing rule initially: cancellation is allowed before the session date in Tehran time.
- Lock occurrence and reservation, verify owner and active status.
- Mark reservation cancelled and append a compensating `+1` ledger entry referencing the original debit; do not update/delete the debit.
- Enforce unique idempotency key for the release so retries cannot credit twice.
- Recalculate booked_count from active reservations while the occurrence row is locked.

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
- A booked student who does not attend: original booking debit remains unless a staff-authorized exception is recorded.
- A make-up session tied to an already charged absence must not debit another ordinary credit. It should reference the original absence/reservation and be auditable.
- An unreserved walk-in or extra session must use an explicit staff workflow and separate billing/adjustment, not silently bypass capacity or debit a normal credit.

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
6. Student cancellation before session date releases exactly one credit; retry does not release twice.
7. Cancellation on/after session date rejected under current policy.
8. Staff occurrence cancellation releases all active reservations once.
9. Attendance present/absence does not debit a second time.
10. Make-up completion does not debit another ordinary credit.
11. Student cannot reserve or cancel for another student.
12. Student cannot call staff cancellation or alter another student's ledger.
13. Overlapping active subscriptions are rejected or handled by an explicitly defined selection policy.

## Decisions to confirm before implementation

- Current 005 rule allows student cancellation until the session date. Confirm that a cancellation made any time before the session date should return the credit in full.
- Recommended default: a booked no-show keeps the booking debit; a prior-notice absence should also keep it unless the teacher grants a make-up/credit adjustment. A teacher-cancelled session always releases the credit.
- Confirm whether a teacher/manager may create a walk-in reservation after a class begins, and whether that consumes a monthly credit or is always billed as an extra session.
