# Monthly subscription and credit model (design)

## Confirmed product rules

- Subscription terms: 1, 2, or 3 months.
- The selected session quota is **per month**, not for the whole term.
- Suggested monthly quotas are 4, 8, and 12, but the teacher/manager may enter any positive integer (for example 6 or 10).
- Therefore a two-month package at 6 sessions/month has 12 total planned sessions; a three-month package at 10 sessions/month has 30.
- Price and any term discount are configurable by staff. Price must be snapshotted on purchase so later price changes do not rewrite history.
- A student with valid credit can reserve any published eligible occurrence, subject to capacity and booking rules; fixed class-day enrollment must not define entitlement.
- Extra time and extra sessions remain separate attendance adjustments/payments and must not silently consume normal subscription credits.

## Recommended accounting model

Use a subscription header plus month-by-month allocations and an append-only ledger. Do not use a fixed list of class_session_id slots as the entitlement definition.

### Subscription header

Recommended fields: id, student_id, duration_months (1..3), monthly_session_quota (positive integer, arbitrary), starts_on, ends_on, status, agreed_total_price, discount_amount, currency, pricing_snapshot, rollover_policy, created_by, activated_at, created_at, updated_at.
Calculate ends_on using calendar-month arithmetic; do not approximate a month as 30 days. Snapshot quoted price and discount at purchase.

### Monthly allocations

One row per subscription period: id, subscription_id, period_number (1..duration_months), period_starts_on, period_ends_on, quota, credited_at, with unique(subscription_id, period_number).
A 2-month / 6-per-month purchase yields two monthly allocations of 6, not one unrestricted pool of 12. This prevents early use of future-month entitlement.

### Append-only credit ledger

Each row should record subscription_id, allocation_id, student_id, delta (+/- integer), reason, source_type, source_id, unique idempotency_key, actor_id, created_at, and optional reversal_of_id.
Never update/delete a posted ledger entry. Correct mistakes with a compensating reversal. Enforce balances and protect the last credit against concurrent spending.

### Reservation and attendance lifecycle

- Booking a published occurrence reserves one credit atomically (or creates an explicitly modelled expiring hold); cancellation before cutoff releases it with a compensating ledger entry.
- Attendance finalization must not debit again if reservation already consumed credit. No double-charge across booking and attendance.
- Associate reservation with allocation/ledger debit so cancellation, no-show, and staff correction are auditable.
- No-show/absence charging must be an explicit policy. Existing 007 debits finalized attendance statuses, including absences; do not reuse unchanged.
- Make-up attendance references the original charged absence and must not debit a second ordinary credit.
- Enforce capacity, duplicate active booking, eligibility window, ownership, and staff permissions server-side in one transaction.

## Important incompatibilities found

1. docs/setup/007_credit_ledger_and_makeups.sql depends on student_subscriptions and student_subscription_slots, but docs/setup/006_monthly_subscriptions.sql does not exist on main.
2. The 007 ledger only permits credit_delta = -1, links consumption to attendance, and selects by fixed class_session_id slot. It has no monthly allocations, positive release/reversal entries, booking debit, or idempotency key.
3. The reservation RPC in docs/setup/005_session_reservations.sql validates fixed enrollment and has no subscription-credit debit. It cannot be combined with paid monthly credit as-is.
4. Existing attendance_adjustments already models extra_time and extra_session; keep those charges separate.
5. Live database inventory currently has none of student_subscriptions, student_subscription_slots, student_subscription_credit_ledger, or student_makeup_requests. No database changes were made during this review.

## Implementation sequence

1. Replace missing/incompatible 006/007 design with reviewed owner-run setup scripts, read-only preflight checks, and rollback notes.
2. Add transactional server-side functions for activation/monthly allocation, reserve, cancel/release, attendance finalization, and reversal. Lock allocation while spending.
3. Add RLS for student-own reads and staff management. Do not trust user-editable profile metadata for roles. For essential SECURITY DEFINER functions, validate auth.uid()/staff role, pin search_path, revoke PUBLIC/anon execution, and test permissions.
4. Update student purchase/renewal UI and staff subscription editor; show current-month and future-month quota separately.
5. Test term arithmetic, arbitrary quota, month boundaries, rollover policy, concurrent final-credit booking, duplicate booking, cancellation/refund, attendance idempotency, make-up completion, expired/paused packages, and staff authorization.
6. Run lint, unit tests, build, SQL preflight, and Supabase advisors before owner applies scripts.

## Decisions still requiring product confirmation

- Rollover of unused monthly sessions: recommended default is no rollover, configurable per package.
- Month boundaries: recommended periods are consecutive calendar months anchored to activation date (for example, activation on the 17th means each period runs from the 17th to the day before the 17th next month). Confirm before final SQL/UI behavior.
- Absence charging and cancellation cutoff: define explicitly before enabling automated debits.
## Confirmed rolling monthly period rule

Subscription periods are anchored to the actual activation date, not the first day of a calendar month. A student activating on the 17th receives a first period beginning on the 17th. Later periods use the same anchor day.

Use calendar-month arithmetic with end-of-month clamping: if the activation day does not exist in a target month, use that month's final day. For example, activation on January 31 yields a first monthly period through February 28 (or February 29 in a leap year); the next period begins March 31. This avoids inventing a nonexistent February 31 and avoids permanently shifting the anchor to the 28th.

Store each period's explicit start and end dates when allocating it, rather than recalculating historical periods from the current date. Define the subscription end date as the end date of its final monthly period. Quota becomes available for each period only when that period starts.

Examples:
- Activation on the 17th: periods start on the 17th of each successive month.
- Activation on January 31: next period starts on February's last day; the following period returns to March 31.
- Activation on a date such as the 30th: months without a 30th use their last day; subsequent periods return to the 30th when it exists.