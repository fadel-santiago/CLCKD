# Data Model — Videographer Manager v1

The single source of truth for the SQLite schema, the allowed value sets, the
money and date rules, and how deletion/archive works. **Nothing in this file is
optional**: implementation, migrations, and validators all conform to it.
AGENTS.md §3 and §9 reference specific rules by name.

Conventions:
- Table names are `snake_case` singular.
- **Dates that are user-facing calendar days** (`shoot_date`, `due_date`,
  `start_date`, `end_date`, `payment_due_date`, `date_issued`, `valid_until`)
  are stored as ISO `YYYY-MM-DD` in the user's `default_timezone` (see
  §5, rule 1). **Timestamps** (`created_at`, `updated_at`, `archived_at`)
  are RFC-3339 UTC in `TEXT`.
- All monetary values are **integer minor units** (see §"Money representation").
- Every table has `id`, `created_at`, `updated_at`; archive-protected tables
  additionally have `archived_at`.
- Primary keys are **ULID** strings (26 chars, sortable, safe in URLs) — chosen
  over INTEGER for stable external references without leaking volume or order.

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
| `created_at` | TIMESTAMPTZ (UTC) | no | |
| `updated_at` | TIMESTAMPTZ (UTC) | no | |
| `archived_at` | TIMESTAMPTZ (UTC) | yes | NULL = active. See §"Archive." |

**Unique index:** `(name, country)` — case-insensitive on name, for de-dup help.
This is advisory (the app surfaces the collision but does not block) — the
validator allows duplicates with a warning, and only the user's explicit "force"
flag blocks. *Documented so it doesn't surprise later.*

### 1.2 `project`

| Field | Type | Null | Notes |
|---|---|---|---|
| `id` | TEXT (ULID, PK) | no | |
| `client_id` | TEXT, FK→`client.id` | no | `ON DELETE RESTRICT` (archive, don't delete). |
| `title` | TEXT | no | Non-empty, trimmed, maxLength 200. |
| `status` | TEXT (ENUM) | no | See `PROJECT_STATUS`. Default `lead`. |
| `start_date` | DATE (UTC) | yes | See §"Date rules." |
| `end_date` | DATE (UTC) | yes | If both present, `end_date >= start_date`. |
| `location` | TEXT | yes | Free-form address/area, maxLength 300. |
| `budget_minor_units` | INTEGER | yes | See §"Money." |
| `budget_currency` | TEXT (ISO-4217) | yes | Required iff `budget_minor_units` set. Uppercase on save. |
| `notes` | TEXT | yes | maxLength 5000. |
| `created_at` / `updated_at` / `archived_at` | TIMESTAMPTZ | | Same as `client`. |

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
| `shoot_date` | DATE (UTC) | no | The calendar day of the shoot. |
| `call_time_local` | TIME (HH:MM, 24h) | yes | **Local to the shoot's location** — see §"Date rules." Stored without zone; paired with `location_tz`. |
| `location_tz` | TEXT (IANA) | no | e.g., `Europe/Paris`, `America/New_York`. Required. |
| `location` | TEXT | no | Free-form, maxLength 300. |
| `crew_notes` | TEXT | yes | maxLength 5000. |
| `created_at` / `updated_at` / `archived_at` | TIMESTAMPTZ | | |

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
| `shoot_id` | TEXT, FK→`shoot.id` | no | `ON DELETE CASCADE` (deleting a shoot removes its checklist — this is the *only* cascade in v1, and it is scoped inside one entity). |
| `item` | TEXT | no | Non-empty, trimmed, maxLength 200. |
| `checked` | INTEGER (0/1, CHECK) | no | Default 0. |
| `sort` | INTEGER | no | Default 0; user can reorder (up/down). |
| `created_at` | TIMESTAMPTZ | no | |

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
| `due_date` | DATE (UTC) + implicit zone | yes | See §"Date rules." If NULL, the task is "no due date." |
| `status` | TEXT (ENUM) | no | `TASK_STATUS = { todo, in_progress, blocked, done }`. Default `todo`. |
| `created_at` / `updated_at` / `archived_at` | TIMESTAMPTZ | | |

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
| `due_date` | DATE (UTC) | yes | If NULL, no due date. |
| `review_status` | TEXT (ENUM) | no | `REVIEW_STATUS = { not_submitted, awaiting_review, in_review, approved, changes_requested }`. Default `not_submitted`. |
| `revision` | INTEGER | no | **1-based**. Default 1. Increments are user-explicit (no auto-increment on submit — the user chooses when to bump). Enforced by CHECK `revision >= 1`. |
| `link` | TEXT (URL) | yes | Absolute URL (http/https/s3/file). Validated as URL. The user is responsible for the target. |
| `notes` | TEXT | yes | maxLength 2000. |
| `created_at` / `updated_at` / `archived_at` | TIMESTAMPTZ | | |

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
| `payment_due_date` | DATE (UTC) | yes | If NULL, no due date. |
| `date_issued` | DATE (UTC) | yes | Optional; set when `sent`. |
| `notes` | TEXT | yes | maxLength 2000. |
| `created_at` / `updated_at` / `archived_at` | TIMESTAMPTZ | | |

**Invoice invariants (enforced by CHECKs + triggers + service):**
- `invoice_status = paid  ⇒  payment_status = paid`.
- `payment_status = paid  ⇒  invoice_status ∈ {paid}` and `amount_minor_units > 0`.
- `invoice_status = void  ⇒  payment_status ∈ {unpaid, partial}` (a void
  invoice is never `paid`; `overdue` collapses to `unpaid` on void).
- `payment_status = overdue` is **not user-set**; it is *derived* whenever
  `payment_status = unpaid` AND `payment_due_date < today(user_zone)`. The app
  materializes this at read time AND at write time (a trigger recomputes on
  every update and on the daily "tick" if the app happens to be running).
  (If the app is closed past a deadline, the first read recomputes.)

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
| `valid_until` | DATE (UTC) | yes | |
| `notes` | TEXT | yes | |
| `created_at` / `updated_at` | TIMESTAMPTZ | | No `archived_at` (a project archive covers it; no independent archive). |

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
| `updated_at` | TIMESTAMPTZ | |

Allowed v1 keys (the validator enforces the closed set):

  - `default_timezone` — IANA, default `UTC`.
  - `default_currency` — ISO-4217, default `EUR` (configurable, user-editable).
  - `upcoming_shoots_window_days` — integer 1..90, default 14.

---

## 2. Relationships (ER at a glance)

```
client 1 ──* project 1 ──* shoot        { project 1 ──1 quote }
                          │             project 1 ──* task
                          │└──* shoot_equipment_item (CASCADE on shoot delete)
                          │
                          └──* invoice
                          └──* deliverable

invoice * ──* (none — flat, no line items in v1)
task    1 ──1 (one project; v1 has no subtask)
```

- No circular FKs.
- CASCADE is used exactly once, on `shoot_equipment_item.shoot_id`, and only
  *within a single logical entity* (deleting a shoot removes its checklist).
  Every other FK is `RESTRICT`.
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
| `invoice.payment_status` | `unpaid`, `partial`, `paid`, `overdue` |

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

1. **Storage:** every DATE column is stored as a **calendar day** in the
   user's **default timezone** (see `kv_meta.default_timezone`), in ISO `YYYY-MM-DD`
   format (SQLite `TEXT`). **No UTC in date columns** for dates that *are*
   user-facing calendar days (shoot date, due date, budget dates, invoice
   due date). This is deliberate: "due on Friday" means Friday in the user's
   zone, not UTC.
2. **Storage:** every TIMESTAMPTZ column (`created_at`, `updated_at`,
   `archived_at`, `date_issued` when it's a point-in-time) is stored as an
   RFC-3339 string in UTC, `YYYY-MM-DDTHH:MM:SSZ`. SQLite `TEXT`, compared
   lexicographically.
3. **Time-only fields:** `shoot.call_time_local` is a **naive local time**
   (HH:MM) that is always interpreted in `shoot.location_tz`. It is not
   converted on save or display.
4. **Zone source of truth:** for calendar "today," use `kv_meta.
   default_timezone`. For per-record zones (e.g., a shoot in another
   country), use the record's own `location_tz`.
5. **DST handling:** conversions between the record's zone and the user's
   zone are done with the system IANA database. No hand-rolled offsets.
6. **"Overdue" is a user-zone comparison.** `task.due_date < today(user_zone)`
   — *not* UTC (as stated in §1.5). If any test disagrees with this document,
   this document wins — fix the test.
7. **No implicit zone on save.** If a request does not specify a zone for a
   *timestamp*, the server stamps `created_at`/`updated_at` in UTC. If a
   *date* is written, the user's `default_timezone` is applied.
8. **Migration:** any new column that looks date-like must be declared with
   an explicit zone column or with a named constant; the checker script in
   the implementation-plan M1 enforces this by inspecting the migration file.
9. **Timezone changes for existing data** are out of scope in v1. If the user
   changes `default_timezone`, it affects *future* "today" comparisons, not
   historical record dates. (This is a documented limitation.)

---

## 6. Archive and deletion behavior

**Rule (AGENTS.md §9): v1 has no hard delete for the five core entities
(client, project, shoot, task, deliverable, invoice, quote). The only
user-visible "remove" action is "archive."**

### 6.1 Archive (the v1 delete)

- Archive sets `archived_at = now(UTC)` on the row (and on dependent rows, see
  below).
- Archived rows are **excluded** from every default list, dashboard panel, and
  dropdown. They are **included** in an explicit "show archived" view, in
  search, and in exports.
- Archive is **fully reversible** via `un-archive` (set `archived_at = NULL`
  on the row; dependents are not re-un-archived automatically — the UI lists
  them individually).
- **Cascading archive** (v1):
  - Archiving a `client` archives all its `project`s (and through them, their
    children) — a single `un-archive(client)` un-archives the client only;
    the user re-enables projects individually. This is documented and tested.
  - Archiving a `project` archives its `shoot`s, `task`s, `deliverable`s,
    and `invoice`s (and `shoot_equipment_item`s implicitly, since they
    follow their `shoot`).
  - Archiving a `shoot` archives its own `shoot_equipment_item`s (no cascade
    to the project).

### 6.2 Hard delete (v1: admin-only, gated)

- A **separate** action "hard delete" exists in the UI *only* behind a
  confirmation dialog that requires typing the client/project name.
- A hard delete:
  1. Refuses if any non-archived dependent rows exist (returns HTTP 409 with
     the count and the dependent list).
  2. Requires the row to be archived first (if not, an automatic archive
     happens; the user must re-confirm).
  3. Creates a **pre-delete snapshot** in `data/snapshots/<ulid>.json`
     outside the git-ignored path — *inside `data/`, which is itself
     git-ignored;* the *presence* of the file is logged to
     `data/audit.log` (also git-ignored).
  4. Then deletes the row via a **single, named** migration-style service call
     (the SQL is explicit, parameterized, and unit-tested), not via a generic
     "delete by predicate" path.
- **CASCADE** (the one place in v1 hard delete is allowed to cascade):
  `shoot_equipment_item` on `shoot` hard delete. All other FKs are
  RESTRICT, so a hard delete that would orphan is refused.

### 6.3 Retention

- v1 does not define a retention schedule or an auto-expiry. The only way
  data goes away is: the user hard-deletes, or the OS deletes the file.
- The `data/` directory is the app's responsibility: it is *owned* by the app
  (created, locked with sensible permissions) and *documented* to the user
  for backups.

### 6.4 Test assertions (implementation-plan references these)

- `T-ARCH-001`: archiving a project sets archived_at on project, its shoots,
  tasks, deliverables, invoices; un-archiving the project does *not*
  un-archive the children.
- `T-ARCH-002`: hard-deleting a non-archived client with live projects
  returns 409 and lists the dependents.
- `T-ARCH-003`: hard-delete of a `shoot` cascades its equipment items; a
  snapshot file exists at `data/snapshots/`; the row is gone.
- `T-ARCH-004`: after `un-archive(client)`, its projects remain archived
  (user must un-archive individually). Verified by list views.

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
- Audit log table (v1 uses `data/audit.log` text; v1.1 may be a table).

Any addition requires a plan revision + a paired migration.
