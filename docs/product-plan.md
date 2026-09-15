# Product Plan — Videographer Manager v1

**Scope:** planning only. This document defines what v1 is, who it is for, what it
does, and what it deliberately does not do. The schema is in `docs/data-model.md`;
the build order is in `docs/implementation-plan.md`; the working rules are in
`AGENTS.md`.

---

## 1. Target user

- **Primary:** a solo professional videographer (weddings, events, product/brand
  video, documentaries) who runs their own pipeline on a laptop or desktop and
  sometimes works from a tablet in the field.
- **Secondary:** a very small studio (owner + 1 partner) where a single operator
  still manages the data. Only one human uses the app at a time.
- **Working context:** offline-capable, on the operator's own machine (or a
  dedicated local box). The user cares about: "what do I need to do this week,"
  "what is owed to me," and "where does each job stand."
- **Not for:** agencies that need approval chains, role-based permissions,
  customer self-service portals, or integration with accounting/CRM SaaS.

Operating assumptions:
- One user, one device family (desktop primary, tablet secondary).
- Data volume is small (tens to a few hundred active records) and grows slowly.
- Correctness and durability of the record matter more than feature breadth.

---

## 2. Primary workflows

The v1 app is organized around these day-to-day loops. Each must work end-to-end
without touching anything outside the machine.

### W1 — Take on a new piece of work
1. Find or create a **client**.
2. Create a **project** linked to that client: title, status, planned dates,
   location, budget, notes.
3. Record the **quote** amount for the project.
4. Create the first **tasks** (e.g., "send contract," "scout location") and
   one or more **shoots** with date, call time, location, crew notes, and an
   equipment checklist.

### W2 — Run the daily / weekly operation
1. Open the **dashboard**.
2. See: active projects, upcoming shoots, overdue tasks, deliverables awaiting
   review, and unpaid invoices.
3. Work **tasks** to done; update a **shoot's** equipment checklist on the
   day; add crew notes.
4. Create/close **deliverables** as edits finish and revision counts increment.

### W3 — Get paid
1. When a project is delivered, raise the **invoice status** (e.g.,
   `draft → sent → paid`) and record the payment status and due date.
2. The dashboard surfaces invoices that are overdue or unpaid so none slip.

### W4 — Keep the record healthy
- Edit/clarify client details, project notes, dates.
- Mark projects finished; later **archive** (never accidentally delete) the
  client/project/related records so history stays intact but out of the way.

---

## 3. MVP features

Each item is a concrete, testable capability. IDs reference the data model.

### F1. Clients
- List, create, edit, archive clients.
- Fields: name (business or person), preferred contact name, email, phone,
  address, notes.
- View linked projects and total outstanding (unpaid invoice) amount per client.

### F2. Projects
- List, create, edit, archive projects.
- Fields: client link, title, status, start date, target/end date, location,
  budget, notes.
- Project detail view aggregates: its shoots, tasks, deliverables, and money
  (quote + invoices).

### F3. Shoots
- Attach one or more shoots to a project.
- Fields: date, call time, location, crew notes, equipment checklist
  (reusable list of items with checked/unchecked state).
- Dashboard shows upcoming shoots within a configurable window.

### F4. Tasks
- Attach tasks to a project (all tasks in v1 are project-linked).
- Fields: title, description, priority, due date, status.
- Filter/sort by status and sort by due date; dashboard shows overdue.

### F5. Deliverables
- Attach deliverables to a project.
- Fields: type (e.g., edit, color, audio, thumbnail), due date, review status,
  revision count, external link.
- Track client review via review status; revision count increments explicitly.
- Dashboard shows deliverables awaiting review.

### F6. Money (quote + invoices)
- Project has one **quote amount** (what was agreed) with currency.
- One or more **invoices** per project: amount, currency, invoice status
  (draft/sent/paid/void), payment status (unpaid/partial/paid/overdue),
  payment due date.
- No email, no payment gateways, no PDFs in v1 — status tracking only.
- Dashboard shows unpaid/overdue invoices and totals.

### F7. Dashboard
A single home page showing:
- **Active projects** (open statuses), with key dates and owner client.
- **Upcoming shoots** in the next N days (default 14) sorted by call time.
- **Overdue tasks** (status not done and due date in the past).
- **Deliverables awaiting review** (review status = awaiting/under review).
- **Unpaid invoices** (payment status unpaid/overdue/partial) with amount + due.
- Quick numbers: counts + total amount due.

### F8. Cross-cutting
- **CRUD + archive** for all entities (archive sets `archived_at`, preserves
  data, hides from default lists; an "archived" filter reveals them).
- **Deterministic sorting** and **pagination** on all list views.
- **Full input validation** (per AGENTS.md §3) with human-readable field errors.
- **Responsive layout**: comfortable on desktop (≥1024px) and tablet
  (≥600px); touch-friendly tap targets. (Narrow phone is not a v1 target.)
- **Local persistence**: SQLite under `<repo>/data/` survives restarts.
- **No external calls**: offline-capable, no telemetry, no analytics.

---

## 4. Non-goals (explicit for v1)

- ❌ Multi-user accounts, roles, permissions, concurrent editing.
- ❌ Authentication/login (single-operator tool; optional in a later version).
- ❌ Cloud sync, remote backup, web deployment, or any network dependency.
- ❌ Email/SMTP, notifications, calendar (iCal sync), or reminders pushed
  anywhere. (In-app due-date display is included; external pushing is not.)
- ❌ Real invoicing: no PDF generation, no sending, no tax/ledger, no
  accounting export. (Amount + status + due date only; CSV export of the money
  tables may be a v1.1 stretch, not promised.)
- ❌ Payment processing or any connection to a payments provider.
- ❌ Media: no uploads, no file storage, no transcoding, no previews, no
  download links we host. Deliverables carry an external *link* string only.
- ❌ Scheduling optimization, resource/crew allocation, time-sheeting,
  expenses tracking, or reporting/analytics dashboards beyond the v1 dashboard.
- ❌ i18n/localization beyond a single default locale (English by default);
  date-only values preserve their applicable timezone semantics, and event
  timestamps use UTC, so localization can be added later without data
  loss.
- ❌ Mobile phone-optimized UI and any offline *PWA* service-worker sync
  story. (Local-first persistence is a yes; cross-device sync is a no.)
- ❌ Automatic backups. Manual export of the SQLite file is documented;
  scheduling is out of scope.
- ❌ Permanent hard deletion. v1 has no hard-delete UI, API, or service;
  archive and unarchive are the only user-visible removal operations.

---

## 5. Acceptance criteria

These are the verifiable conditions that must all hold for "v1 done." Each maps
to at least one test (see `docs/implementation-plan.md` acceptance tests).

### Data & persistence
1. After `npm run build` + restart, all previously entered records remain
   identical (SQLite at `<repo>/data/`).
2. No record is lost after an unclean shutdown during a write (SQLite WAL
   journal mode is enabled; a corrupt-write test recovers cleanly).
3. All five entity types can be created, read, updated, archived, and restored
   through the UI and through the API/RSC routes; archived records are excluded
   from default lists and included under "show archived."

### Correctness
4. A project cannot be created without a client reference; an orphan record is
   impossible (FK + server-side validation both enforce).
5. Money is stored as integer minor units with currency; no floating-point
   rounding is observable anywhere in the UI (tests assert equality of known
   values like 0.1 + 0.2 cases).
6. Status fields only accept the enumerated values in `docs/data-model.md`;
   a rejected value returns a validation error, never a silent default.
7. User-facing calendar dates are stored as ISO `YYYY-MM-DD` in the applicable
   user or record timezone; UTC is not used to reinterpret calendar-day values.
   `created_at`, `updated_at`, and `archived_at` timestamps are stored as UTC
   RFC-3339 strings. `shoot.call_time_local` is stored as local `HH:MM` and
   interpreted with `shoot.location_tz`. Overdue calculations use the user's
   configured IANA timezone. Tests cover DST boundaries and prevent
   off-by-one-day behavior.

### Workflow coverage (each W# works end-to-end)
8. W1: new client → project → quote → task → shoot, all linked, viewable on
   dashboard within the same session.
9. W2: a shoot's checklist item toggled on the UI persists; a task moved to
   done leaves the overdue list.
10. W3: an invoice moved to `paid` removes it from the unpaid dashboard panel;
   an invoice past its due date with payment status `unpaid` is surfaced as
   overdue.
11. W4: archiving a project hides it and its default-listed children while the
   data is still present and restorable by "un-archiving."

### Dashboard
12. The dashboard shows exactly: active projects, upcoming shoots (within the
    window), overdue tasks, deliverables awaiting review, unpaid invoices —
    each panel independently correct and independently empty-state handled.
13. Every panel link navigates to a filtered list of the same items.

### Quality gates (from AGENTS.md §5)
14. `npm test`, `npm run typecheck`, `npm run lint`,
    `npm audit --omit=dev --audit-level=high` (0 high/critical), and
    `npm run build` all pass.
15. `tsc` strict mode is on; no `any` escapes untrusted boundaries (lint rule
    enforces).
16. A security review pass (manual) confirms: no outbound network calls in
    runtime code, no secrets in the tree, SQLite is the only persistence.

### Responsiveness / usability
17. Layout is usable at 375×667 (reference only), 768×1024 (tablet, target),
    and 1280×800 (desktop, target); no horizontal scroll at the target widths;
    tap targets ≥ 44×44 CSS px.

### Safety
18. Archiving an entity preserves every referenced record and remains
    reversible; a test proves the archived record can be restored.
19. No `git add`-able file contains a secret or real PII; a grep over the
    committed tree for common secret patterns finds nothing.

---

## 6. Success definition (post-ship)

- The operator can run a full day using only the dashboard + one entity list.
- Nothing on-screen requires the network.
- Two weeks of real use with zero data loss and zero "lost a record" complaints.
- Backups are understood: user knows where `data/app.sqlite(-wal)` is.
