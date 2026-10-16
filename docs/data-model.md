# Data Model — CLCKD v1

Implementation extension — local access (migration 0006)

`owner_account` is singleton local configuration (id = 1), display_name,
scrypt password_hash, access_mode = local_owner and UTC created_at. It does not
claim a paid subscription. `access_invitation` has ULID id, project_id FK,
recipient_name, unique SHA-256 token_hash, share_payments, and UTC created_at,
expires_at, claimed_at and revoked_at. `invitation_output` has composite PK
(invitation_id, deliverable_id); service validation restricts grants to that
invitation's active project. `access_session` uses SHA-256 token_hash PK,
role owner/project_viewer, nullable invitation_id/project_id, UTC created_at,
expires_at/revoked_at; a CHECK binds viewer sessions to both project/invitation
and owner sessions to neither. `access_attempt` holds cooldown buckets.
These security/configuration records intentionally do not follow entity ULID
or updated_at conventions. All FKs use RESTRICT. Logout/revocation updates rows,
not business data. A maintenance down migration retains access tables as archives.

Owner pages, metadata and mutations check owner sessions. Mutations also require
a same-origin local request. Client reads require a non-expired session and
active non-revoked invitation, project and client. Their allowlisted DTO contains
only selected output specifications/current submitted links and optionally the
commercial schedule, excluding raw receipt evidence, private notes and tokens.
The local bootstrap code has 12 uniformly random base-32 characters (60 bits),
grouped XXXX-XXXX-XXXX in an ignored, mode-0600 file, not a web response.
It is case-insensitive and ignores spaces/hyphens. Legacy 256-bit setup secrets
are deterministically converted to this short format; previously copied long
codes remain compatible. Only initial owner setup accepts this code, with five
attempts per 15 minutes; later sign-ins require the owner passphrase.
Invitation and session secrets remain random 256-bit values;
raw invite tokens are returned to the authenticated owner once, not persisted.

Implementation extension — payment agreements (migration 0003)

`production_payment_plan` retains versioned commercial schedules using composite
PK (project_id, revision), integer total_minor_units, supported currency,
optional contract_reference/terms and UTC timestamps. `production_payment_milestone`
stores a ULID id, project_id/plan_revision FK, position, title, integer basis_points,
integer amount_minor_units, payment_condition, optional calendar due_date,
optional paid_at/payment_reference and UTC timestamps. Percentages total exactly
10000 basis points. Largest-remainder integer allocation sums exactly to the fee.
Every milestone must receive at least one minor unit. Previous schedules remain
stored; replacing a schedule checks its expected revision, disallows recorded
payments and reopens scope confirmation. No application deletion is exposed.
Payment receipt and corrections are manual, acknowledged and appended to
production_event. They do not update approvals, invoice statuses or move funds.
Contract text is a record of external terms, not a signed legal agreement.
These tables follow the parent project's archive visibility.

Migration 0004 adds `work_gate`: none/production/post_production/delivery,
default none to preserve existing agreements. An unpaid configured milestone
blocks its app phase transition, review submission (production/post-production)
or delivery action. Payment gates also apply to generic project status updates.
Shoot completion can be recorded after production payment even when the
post-production advance remains outstanding; editing stays gated. External work
and bank transfers cannot be controlled by these application rules.

Migration 0005 handles the development preview's early unversioned payment
draft and the versioned draft. It copies each record into the canonical
versioned schema, retains original tables as draft archives, and preserves
receipt references, work gates and plan revisions. Compatibility fixtures test
both shapes and foreign-key integrity. No application route accesses archives.

The local client-preview tab is read-only, refreshes recorded progress, and
contains current outputs/review links and payment milestones. It is not an
authenticated or externally shared client portal. Its five checkpoints are not
an estimate of hours worked. HTTPS review links are accepted; plausible
bare web addresses are normalized to HTTPS. Unsafe schemes and credentials in
links are rejected. Hosted service links open externally; direct video links
can be played without automatically preloading third-party media.

Implementation extension — production workflow (migration 0002)

`production_project` extends `project` one-to-one using `project_id` as its PK:
production_type (film/photography/event/custom), nullable approver_name,
scope_revision >= 1, nullable scope_confirmed_at and shoot_completed_at, plus
created_at and updated_at. `output_spec` extends `deliverable` one-to-one using
deliverable_id: nullable format, quantity 1..999, revision_allowance 0..20 and
created_at/updated_at. These extension PKs are intentional exceptions to the
regular entity ULID-id convention.

`output_version` uses composite PK (deliverable_id, revision). It stores title,
link, change_note, feedback, review_status, nullable submitted_at/approved_at/
approved_by/delivered_at and created_at/updated_at. The recorded approver is
preserved even if the project's current approver later changes. Submitted title/link/change_note are
immutable. Delivery requires approval. New revisions are explicitly requested
and never inherit approval or delivery. Legacy rows preserve their revision and
status without inventing client attribution or timestamps.

`production_event` is an append-only record with ULID id, project_id, nullable
deliverable_id/revision, kind, nullable attributed_to/details, source fixed to
local_operator, and created_at. It intentionally has no updated_at. This is a
production-decision history, separate from optional archive/unarchive auditing.
Recording client approval means the local operator reports the named person's
decision; it does not establish an authenticated signature.

All new FKs use ON DELETE RESTRICT. Extension/version/event records follow their
parent's archive visibility. Their timestamp columns use TEXT RFC-3339 UTC.
Version-specific approval withdrawal is allowed before delivery and adds an
event; after delivery a correction request leaves approval and delivery intact.
Review submissions and decisions check the active project/output and expected
revision/link/scope revision inside a transaction. Wrapping requires confirmed scope and every active output's
current version delivered; external payment status is unaffected.

These explicit versioned-workflow rules govern managed outputs; the original
entity definitions below retain their legacy storage compatibility.

The single source of truth for the SQLite schema, the allowed value sets, the
money and date rules, and how deletion/archive works. **Nothing in this file is
optional**: implementation, migrations, and validators all conform to it.
AGENTS.md §3 and §9 reference specific rules by name.

Conventions:
- Table names are `snake_case` singular.
- **User-facing calendar dates** (`shoot_date`, `due_date`, `start_date`,
  `end_date`, `payment_due_date`, `date_issued`, `valid_until`) use SQLite
  `TEXT` containing ISO `YYYY-MM-DD` in the applicable user or record timezone.
- **Timestamps** (`created_at`, `updated_at`, `archived_at`) use SQLite `TEXT`
  containing RFC-3339 UTC values.
- **Local times** such as `call_time_local` use SQLite `TEXT` containing
  `HH:MM` and are interpreted using their associated IANA timezone.
- Field tables specify physical SQLite storage types. They do not use
  `DATE`, `TIME`, or `TIMESTAMPTZ` as aliases.
- All monetary values are **integer minor units** (see §"Money representation").
- Regular entity tables use a ULID `id` primary key. The strict one-to-one
  `quote` table instead uses its ULID `project_id` as the primary key, and
  `kv_meta` uses its setting `key`.
- Every mutable entity table has `created_at` and `updated_at`; `kv_meta`
  intentionally keeps only `updated_at`.
- Archive-protected tables additionally have `archived_at`. `quote` and
  `shoot_equipment_item` have no independent archive state and follow their
  parent record's visibility.
- ULIDs are 26-character sortable strings that are safe in URLs and avoid
  exposing record volume or insertion order.

---

## 1. Entities and fields

### 1.1 `client`

| Field | Type | Null | Notes |
|---|---|---|---|
| `id` | TEXT (ULID, PK) | no | |
| `name` | TEXT | no | Business or person name. Non-empty, trimmed, maxLength 200. |
| `kind` | TEXT (ENUM) | no | `person` \| `organization`. Default `organization`. |
| `preferred_contact_name` | TEXT | yes | maxLength 200. |
| `email` | TEXT | yes | Lowercased on save (validated, not coerced — a malformed value is a rejection, not a fix). |
| `phone` | TEXT (E.164 recommended) | yes | Validated against a permissive E.164 pattern; no default. |
| `address_line1` | TEXT | yes | maxLength 200. |
| `address_line2` | TEXT | yes | maxLength 200. |
| `city` | TEXT | yes | maxLength 100. |
| `region` | TEXT | yes | maxLength 100. |
| `postal_code` | TEXT | yes | maxLength 20. |
| `country` | TEXT (ISO-3166-1 alpha-2) | yes | Uppercase on save. |
| `notes` | TEXT | yes | Free text, maxLength 5000. |
| `created_at` | TEXT (RFC-3339 UTC) | no | |
| `updated_at` | TEXT (RFC-3339 UTC) | no | |
| `archived_at` | TEXT (RFC-3339 UTC) | yes | NULL = active. See §"Archive." |

**Non-unique index (duplicate detection):** `(name, country)` — case-insensitive
on name, for duplicate detection. This index is deliberately **not** UNIQUE:
the app surfaces a possible duplicate, and duplicate clients are permitted
after the user's explicit confirmation. *Documented so it doesn't surprise later.*

### 1.2 `project`

| Field | Type | Null | Notes |
|---|---|---|---|
| `id` | TEXT (ULID, PK) | no | |
| `client_id` | TEXT, FK→`client.id` | no | `ON DELETE RESTRICT` (archive, don't delete). |
| `title` | TEXT | no | Non-empty, trimmed, maxLength 200. |
| `status` | TEXT (ENUM) | no | See `PROJECT_STATUS`. Default `lead`. |
| `start_date` | TEXT (YYYY-MM-DD) | yes | See §"Date rules." |
| `end_date` | TEXT (YYYY-MM-DD) | yes | If both present, `end_date >= start_date`. |
| `location` | TEXT | yes | Free-form address/area, maxLength 300. |
| `budget_minor_units` | INTEGER | yes | See §"Money." |
| `budget_currency` | TEXT (ISO-4217) | yes | Required iff `budget_minor_units` set. Uppercase on save. |
| `notes` | TEXT | yes | maxLength 5000. |
| `created_at` / `updated_at` / `archived_at` | TEXT (RFC-3339 UTC) | | Same as `client`. |

**Invariants:**
- `client_id` must reference a non-archived `client` (enforced by a trigger or
  service-layer check — both, defense in depth).
- `budget_currency` may be NULL if `budget_minor_units` is NULL, but not
  conversely (CHECK constraint).
- `status` transition table (only these moves are legal — validator rejects
  others):

  | From | To |
  |---|---|
  | `lead` | `proposed`, `archived` (via archived_at + status) |
  | `proposed` | `booked`, `lead`, `archived` |
  | `booked` | `in_production`, `proposed`, `archived` |
  | `in_production` | `post_production`, `booked`, `archived` |
  | `post_production` | `completed`, `in_production`, `archived` |
  | `completed` | `in_production` (reopen), `archived` |
  | `on_hold` | any non-terminal state, or `archived` |

  `PROJECT_STATUS = { lead, proposed, booked, in_production, post_production,
  completed, on_hold }`. Terminal states: `completed`, archived (via flag).

### 1.3 `shoot`

| Field | Type | Null | Notes |
|---|---|---|---|
| `id` | TEXT (ULID, PK) | no | |
| `project_id` | TEXT, FK→`project.id` | no | `ON DELETE RESTRICT`. |
| `shoot_date` | TEXT (YYYY-MM-DD) | no | The calendar day of the shoot. |
| `call_time_local` | TEXT (HH:MM, 24h) | yes | **Local to the shoot's location** — see §"Date rules." Stored without zone; paired with `location_tz`. |
| `location_tz` | TEXT (IANA) | no | e.g., `Europe/Paris`, `America/New_York`. Required. |
| `location` | TEXT | no | Free-form, maxLength 300. |
| `crew_notes` | TEXT | yes | maxLength 5000. |
| `created_at` / `updated_at` / `archived_at` | TEXT (RFC-3339 UTC) | | |

**Invariants:**
- `location_tz` must be a valid IANA zone at write time (validator rejects
  unknowns, never falls back to UTC).
- Shoots belonging to a project that is in `lead` status are allowed
  (planning a future shoot) but the dashboard only surfaces shoots of projects
  in non-terminal, non-archived states.

### 1.4 `shoot_equipment_item`

A reusable checklist item tied to a shoot. (Chosen over free-text because the
product requires an *equipment checklist* — structured and checkable.)

| Field | Type | Null | Notes |
|---|---|---|---|
| `id` | TEXT (ULID, PK) | no | |
| `shoot_id` | TEXT, FK→`shoot.id` | no | `ON DELETE CASCADE` is the only schema-level cascade; it protects checklist integrity during migrations and maintenance. v1 exposes no hard-delete operation. |
| `item` | TEXT | no | Non-empty, trimmed, maxLength 200. |
| `checked` | INTEGER (0/1, CHECK) | no | Default 0. |
| `sort` | INTEGER | no | Default 0; user can reorder (up/down). |
| `created_at` | TEXT (RFC-3339 UTC) | no | |
| `updated_at` | TEXT (RFC-3339 UTC) | no | |

**Unique index:** `(shoot_id, item, sort)` allows re-adding the same item only
if the user explicitly bumps `sort` (e.g., two "Canon lenses" items). In
practice, the app dedups on `(shoot_id, item)` case-insensitively at create.

### 1.5 `task`

| Field | Type | Null | Notes |
|---|---|---|---|
| `id` | TEXT (ULID, PK) | no | |
| `project_id` | TEXT, FK→`project.id` | no | `ON DELETE RESTRICT`. v1: every task has a project. |
| `title` | TEXT | no | Non-empty, trimmed, maxLength 200. |
| `description` | TEXT | yes | maxLength 5000. |
| `priority` | TEXT (ENUM) | no | `PRIORITY = { low, normal, high, urgent }`. Default `normal`. |
| `due_date` | TEXT (YYYY-MM-DD) | yes | See §"Date rules." If NULL, the task is "no due date." |
| `status` | TEXT (ENUM) | no | `TASK_STATUS = { todo, in_progress, blocked, done }`. Default `todo`. |
| `created_at` / `updated_at` / `archived_at` | TEXT (RFC-3339 UTC) | | |

**Task-status transition table** (enforced):

  | From | To |
  |---|---|
  | `todo` | `in_progress`, `blocked`, `done` |
  | `in_progress` | `todo`, `blocked`, `done` |
  | `blocked` | `todo`, `in_progress`, `done` |
  | `done` | `in_progress` (reopen only) |

**Overdue definition (dashboard):** `status != done AND due_date < today(user_zone)`,
where `today(user_zone)` is the calendar date in `kv_meta.default_timezone`.
Per §"Date and time-zone rules" rule 6, "today" is *always* computed in the
user's default zone, never UTC. The UI displays a "due <date>" label so the
user can see the exact date that triggered the flag.

### 1.6 `deliverable`

| Field | Type | Null | Notes |
|---|---|---|---|
| `id` | TEXT (ULID, PK) | no | |
| `project_id` | TEXT, FK→`project.id` | no | `ON DELETE RESTRICT`. |
| `type` | TEXT (ENUM) | no | `DELIVERABLE_TYPE = { edit_master, color_grade, rough_cut, final_master, thumbnail, stills, audio_master, social_cutdown, other }`. |
| `title` | TEXT | no | Human name of this deliverable, maxLength 200. |
| `due_date` | TEXT (YYYY-MM-DD) | yes | If NULL, no due date. |
| `review_status` | TEXT (ENUM) | no | `REVIEW_STATUS = { not_submitted, awaiting_review, in_review, approved, changes_requested }`. Default `not_submitted`. |
| `revision` | INTEGER | no | **1-based**. Default 1. Increments are user-explicit (no auto-increment on submit — the user chooses when to bump). Enforced by CHECK `revision >= 1`. |
| `link` | TEXT (URL) | yes | Absolute URL (http/https/s3/file). Validated as URL. The user is responsible for the target. |
| `notes` | TEXT | yes | maxLength 2000. |
| `created_at` / `updated_at` / `archived_at` | TEXT (RFC-3339 UTC) | | |

**Review-status transition table:**

  | From | To |
  |---|---|
  | `not_submitted` | `awaiting_review`, `in_review`, `approved` (if never submitted, approved = auto) |
  | `awaiting_review` | `in_review`, `approved`, `changes_requested` |
  | `in_review` | `awaiting_review`, `approved`, `changes_requested` |
  | `changes_requested` | `awaiting_review` (after re-submit), `in_review` |
  | `approved` | `in_review` (re-open) |

"Dashboard awaiting review" = `review_status IN (awaiting_review, in_review)`.

### 1.7 `invoice`

| Field | Type | Null | Notes |
|---|---|---|---|
| `id` | TEXT (ULID, PK) | no | |
| `project_id` | TEXT, FK→`project.id` | no | `ON DELETE RESTRICT`. |
| `reference` | TEXT | no | Human-readable invoice number (e.g., `INV-2026-001`). Non-empty, maxLength 80, **unique per project** (a `UNIQUE(project_id, reference)` index). |
| `amount_minor_units` | INTEGER | no | Positive (CHECK `> 0`). See §"Money." |
| `currency` | TEXT (ISO-4217) | no | Uppercase on save. |
| `invoice_status` | TEXT (ENUM) | no | `INVOICE_STATUS = { draft, sent, paid, void }`. Default `draft`. |
| `payment_status` | TEXT (ENUM) | no | `PAYMENT_STATUS = { unpaid, partial, paid, overdue }`. Default `unpaid`. |
| `payment_due_date` | TEXT (YYYY-MM-DD) | yes | If NULL, no due date. |
| `date_issued` | TEXT (YYYY-MM-DD) | yes | Optional calendar day; set when `sent`. |
| `notes` | TEXT | yes | maxLength 2000. |
| `created_at` / `updated_at` / `archived_at` | TEXT (RFC-3339 UTC) | | |

**Invoice invariants (enforced by database CHECK constraints and the invoice service):**
- `invoice_status = paid  ⇒  payment_status = paid`.
- `payment_status = paid  ⇒  invoice_status ∈ {paid}` and `amount_minor_units > 0`.
- `invoice_status = void  ⇒  payment_status ∈ {unpaid, partial}` (a void
  invoice is never `paid`; `overdue` collapses to `unpaid` on void).
- `payment_status = overdue` is stored but **never user-set**. The invoice
  service recalculates and persists it whenever an invoice is read or written,
  using `kv_meta.default_timezone` to determine `today(user_zone)`. It sets
  `overdue` when `invoice_status = sent`, `payment_status` is `unpaid` or
  `overdue`, `payment_due_date` is present, and `payment_due_date` is earlier
  than `today(user_zone)`. If a stored `overdue` invoice no longer meets all
  of those conditions, the service normalizes it to `unpaid`. An in-process
  daily tick may refresh open invoices while the app is running; after
  downtime, the first invoice read refreshes it. v1 has no SQLite overdue
  trigger because SQLite cannot calculate “today” in an arbitrary IANA
  timezone without an application-provided function.

**Invoice-status transition table:**

  | From | To |
  |---|---|
  | `draft` | `sent`, `void` |
  | `sent` | `paid`, `void` |
  | `paid` | (terminal, no change — reopen by making a new invoice or voiding+resending) |
  | `void` | (terminal) |

`payment_status` transitions are **derived only**: `sent → overdue` when the
due date passes and no `paid`; `sent → partial` when the user marks a
partial receipt (v1: we record status, not partial amount — a `partial` invoice
still says "unpaid remainder" in the dashboard); any of these → `paid` when the
user marks fully paid. *This is a documented simplification: v1 has no
"amount_paid" column.*

### 1.8 `quote`

A single quote per project. (If a project's price changes over time, the user
edits this — v1 does not retain quote revision history.)

| Field | Type | Null | Notes |
|---|---|---|---|
| `project_id` | TEXT, PK, FK→`project.id` | no | 1:1 with project (each project has ≤1 quote) — enforced by UNIQUE `project_id`. |
| `amount_minor_units` | INTEGER | no | Positive (CHECK `> 0`). See §"Money." |
| `currency` | TEXT (ISO-4217) | no | |
| `valid_until` | TEXT (YYYY-MM-DD) | yes | |
| `notes` | TEXT | yes | |
| `created_at` / `updated_at` | TEXT (RFC-3339 UTC) | | No `archived_at` (a project archive covers it; no independent archive). |

**Invariants:**
- A `project` may not have a `quote` unless `project.status` is one of
  `{proposed, booked, in_production, post_production, completed, on_hold}`
  (no quote on a `lead` before the client relationship exists).

### 1.9 `kv_meta`

A small key/value table for app-level settings (e.g., `default_timezone`,
`default_currency`, `upcoming_shoots_window_days`).

| Field | Type | Notes |
|---|---|---|
| `key` | TEXT, PK | Non-empty, maxLength 80. |
| `value` | TEXT | JSON-encoded (validated). |
| `updated_at` | TEXT (RFC-3339 UTC) | |

Allowed v1 keys (the validator enforces the closed set):

  - `default_timezone` — IANA, default `UTC`.
  - `default_currency` — ISO-4217, default `EUR` (configurable, user-editable).
  - `upcoming_shoots_window_days` — integer 1..90, default 14.

---

## 2. Relationships (ER at a glance)

```
client 1 ──* project 1 ──* shoot        { project 1 ──1 quote }
                          │             project 1 ──* task
                          │└──* shoot_equipment_item (schema-level ON DELETE CASCADE)
                          │
                          └──* invoice
                          └──* deliverable

invoice * ──* (none — flat, no line items in v1)
task    1 ──1 (one project; v1 has no subtask)
```

- No circular FKs.
- `ON DELETE CASCADE` is used exactly once, on
  `shoot_equipment_item.shoot_id`, and only within a single logical entity.
  It protects checklist integrity during migrations or explicit database
  maintenance; v1 exposes no hard-delete UI, API, or service. Every other FK
  is `RESTRICT`.
- No `ON UPDATE` clauses. Any rename of a key is a service-layer update that
  rewrites dependents in the same transaction.

---

## 3. Allowed status values (closed sets)

| Field | Allowed values |
|---|---|
| `client.kind` | `person`, `organization` |
| `project.status` | `lead`, `proposed`, `booked`, `in_production`, `post_production`, `completed`, `on_hold` |
| `task.priority` | `low`, `normal`, `high`, `urgent` |
| `task.status` | `todo`, `in_progress`, `blocked`, `done` |
| `deliverable.type` | `edit_master`, `color_grade`, `rough_cut`, `final_master`, `thumbnail`, `stills`, `audio_master`, `social_cutdown`, `other` |
| `deliverable.review_status` | `not_submitted`, `awaiting_review`, `in_review`, `approved`, `changes_requested` |
| `invoice.invoice_status` | `draft`, `sent`, `paid`, `void` |
| `invoice.payment_status` | Stored values: `unpaid`, `partial`, `paid`, `overdue`. User-writable values: `unpaid`, `partial`, `paid`; `overdue` is derived according to §1.7. |

Unknown values on write → **rejection with a validation error**, never a
silent default. Migration of an unknown value on read (defensive) is an
application-level policy: return it to the client, log a warning; do not map
it to a legal value.

---

## 4. Money representation

**Rule: all money is integer minor units (INTEGER) + ISO-4217 currency
code (TEXT). Never float, never decimal, never string.** Concretely:

- A `budget_minor_units = 15000` with `budget_currency = 'EUR'` means €150.00.
- 1 JPY has **zero** minor units (1 JPY = 1 unit); 1 USD has 100 minor units.
  The mapping (currency → decimals) is a runtime constant table, not
  per-row. It is versioned and never user-overridable.
- The UI renders the minor units using the *currency's* decimals (from the
  constant table), in the *user's locale* (e.g., `Intl.NumberFormat` with
  `style: 'currency'`). The database is **locale-independent**.
- Validation rejects:
  - `NULL` currency with a non-NULL amount;
  - out-of-table currency codes (e.g., `XAU` is rejected in v1);
  - negative zero (normalized) or negative amounts (rejected for
    `quote`, `invoice`);
  - amounts exceeding 10^15 minor units (safety guard against overflow —
    far beyond any realistic invoice).
- Arithmetic:
  - `budget_minor_units - SUM(invoice.amount_minor_units WHERE
    invoice_status IN ('sent'))` is computed as integer subtraction in SQL and
    surfaced to the UI. No intermediate floats.
  - `Intl.NumberFormat` display is the *only* place decimals appear, and it
    takes integer input.
- Rounding: **not applicable** (integers don't round). If any future version
  adds a computed fee or tax rate, the rule is still "integer, round-half-up,
  documented in migration notes."

---

## 5. Date and time-zone rules

1. **Storage:** calendar-date columns use SQLite `TEXT` containing ISO
   `YYYY-MM-DD` and carry no UTC offset. `shoot.shoot_date` is interpreted
   in `shoot.location_tz`; every other calendar-date column is interpreted
   in `kv_meta.default_timezone`. Calendar dates are stored without UTC
   conversion.
2. **Storage:** every timestamp column — the physical
   `TEXT (RFC-3339 UTC)` columns `created_at`, `updated_at`, and `archived_at`
   — is stored as an
   RFC-3339 string in UTC, `YYYY-MM-DDTHH:MM:SSZ`. SQLite `TEXT`, compared
   lexicographically.
3. **Time-only fields:** `shoot.call_time_local` is a **naive local time**
   (HH:MM) that is always interpreted in `shoot.location_tz`. It is not
   converted on save or display.
4. **Zone source of truth:** for calendar "today," use
   `kv_meta.default_timezone`. For per-record zones (e.g., a shoot in
   another country), use the record's own `location_tz`.
5. **DST handling:** conversions between the record's zone and the user's
   zone are done with the system IANA database. No hand-rolled offsets.
6. **"Overdue" is a user-zone comparison.** `task.due_date < today(user_zone)`
   — *not* UTC (as stated in §1.5). If any test disagrees with this document,
   this document wins — fix the test.
7. **No implicit zone on save.** Server-generated `created_at`, `updated_at`,
   and `archived_at` values are RFC-3339 UTC timestamps. Calendar dates are
   validated and stored as `YYYY-MM-DD`; business rules interpret
   `shoot.shoot_date` using `shoot.location_tz` and every other calendar date
   using `kv_meta.default_timezone`.
8. **Migration:** any new column that looks date-like must be declared with
   an explicit zone column or with a named constant. Review migration SQL
   against these rules; the earlier plan's automated column-zone checker
   is not currently implemented.
9. **Timezone changes for existing data** are out of scope in v1. If the user
   changes `default_timezone`, it affects *future* "today" comparisons, not
   historical record dates. (This is a documented limitation.)

---

## 6. Archive and retention behavior

**Rule (AGENTS.md §9): v1 exposes no permanent hard-delete UI, API, service,
administrator role, or generic deletion operation. Archive and unarchive are
the only user-visible removal operations for archive-protected records.**

### 6.1 Archive and unarchive

- Archive sets `archived_at = now(UTC)` on the record and on archive-protected
  dependent records where the cascade rules below apply.
- Archived records are **excluded** from every default list, dashboard panel,
  and dropdown. They are **included** in an explicit "show archived" view, in
  search, and in exports.
- Archive is **fully reversible** via unarchive (`archived_at = NULL`).
  Unarchiving a parent does not automatically unarchive its dependents; the UI
  lists those records for individual restoration.
- **Cascading archive** (v1):
  - Archiving a `client` archives its `project`s and their archive-protected
    dependents. Unarchiving the client restores only the client; projects must
    be restored individually.
  - Archiving a `project` archives its `shoot`s, `task`s, `deliverable`s, and
    `invoice`s. Its `quote` row has no independent archive state and no
    `archived_at`: the row remains stored and follows the archived project's
    visibility (absent from normal application views until unarchived).
  - Archiving a `shoot` does not archive the parent project. Its
    `shoot_equipment_item` rows remain stored but follow the archived shoot's
    visibility and are therefore absent from normal application views.

### 6.2 No permanent deletion in v1

- Application code must not permanently delete user-managed records.
- Every user-visible removal request for an archive-protected record must use
  the archive behavior in §6.1.
- The application registers no hard-delete route, service, UI control, or
  administrator-only exception.
- Schema-level `ON DELETE` actions are referential-integrity constraints for
  migrations or explicit database maintenance. They are not reachable through
  normal v1 application workflows.

### 6.3 Retention

- v1 has no retention schedule or automatic expiry.
- Archived records are retained indefinitely and remain available for
  restoration.
- Application-managed data can disappear only through storage failure or
  deliberate filesystem/database maintenance outside the application.
- The app owns the `data/` directory, creates it with sensible permissions,
  and documents it so the user can make backups.

### 6.4 Test assertions (implementation-plan references these)

- `T-ARCH-001`: archiving a project sets `archived_at` on the project, its
  shoots, tasks, deliverables, and invoices. The quote row (which has no
  `archived_at`) remains stored and follows the archived project's visibility.
  Equipment checklist rows remain stored and hidden through their archived
  shoot. Unarchiving the project does not automatically unarchive its
  archive-protected children.
- `T-ARCH-002`: UI and route/service integration tests expose archive and
  unarchive operations only; no permanent-delete operation is registered.
- `T-ARCH-003`: archived records are absent from default lists, dashboard
  panels, and dropdowns but appear in the explicit "show archived" view.
- `T-ARCH-004`: after `unarchive(client)`, its projects remain archived and
  must be restored individually. List-view tests verify this behavior.

---

## 7. Integrity guarantees (in the DB)

Beyond what's listed per-entity, the schema enforces:

- `PRAGMA foreign_keys = ON` on every connection (checked by a test).
- `PRAGMA journal_mode = WAL` (checked by a test).
- `PRAGMA synchronous = NORMAL` (documented choice; WAL + NORMAL gives
  durability under the "no lost record after unclean shutdown" acceptance
  criterion).
- A `schema_version` row in `kv_meta` (key = `schema_version`, value =
  integer). Every migration is paired (up/down) and bumps this atomically
  with the schema.
- A `CHECK` constraint on every monetary column (`> 0` or `>= 0` as
  appropriate).
- A `CHECK` constraint on every enumerated column (SQLite does not have a
  native ENUM; we use `CHECK (col IN (...))`).

---

## 8. Reserved / not-yet-in-v1 (do not add without a plan revision)

- `client.phone_2`, `client.web` (may be added in v1.1).
- `invoice.amount_paid_minor_units` (v1.1 — will unlock true partial
  payment tracking; v1 keeps `payment_status = partial` as a flag).
- `project.client_reference` (external client ID for cross-system work).
- `task.assigned_to` (v1 has no user).
- `deliverable.file_sha256` (v1 has no file).
- Optional archive/unarchive audit history (not included in v1).

Any addition requires a plan revision + a paired migration.
