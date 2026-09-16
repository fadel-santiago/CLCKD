# Implementation Plan — videographer-manager v1

## 1. Status and binding documents

- **Status:** Draft for v1 implementation. This document describes execution for building v1 in this workspace; it never overrides a binding document.
- **Binding documents (read in this order of authority):**
  - `AGENTS.md` — repository working rules, checkpoint and approval policy.
  - `docs/product-plan.md` — product intent and acceptance criteria 1–19.
  - `docs/data-model.md` — entities, fields, statuses, archive policy, and T-ARCH-001 … T-ARCH-004.
- **Overview (non-binding):** `README.md` — project overview and developer entrypoints.
- **Supersedes** every prior implementation plan and every section of this file that has been overwritten.
- **Scope:** build v1 as specified in the binding documents. No feature, entity, status value, or integration outside those documents may be introduced without an explicit change to the binding documents.

## 2. Fixed technical decisions

- Framework: **Next.js 16** (App Router) and **React 19**.
- Language: **TypeScript**, strict mode.
- Runtime: **Node.js 20.19.2 or newer** for development and local verification; **Node.js 24 LTS** pinned in the production Dockerfile.
- Package manager: **npm** with a committed `package-lock.json`.
- Persistence: **better-sqlite3**, used directly with typed repository code and explicit SQL. No ORM, no query builder.
- Validation: **Zod** is the single shared validation layer — client components, route handlers, and CLI scripts all reuse the same schemas.
- Unit and integration tests: **Vitest**.
- End-to-end tests: **native Playwright test runner** (Playwright Test, not a browser-automation MCP).
- Styles: **CSS Modules** and ordinary CSS. No UI component library.
- Scripts: project-local **tsx** for migration, rollback, and seed entrypoints.
- Persistence target: **SQLite under `data/`** is the only persistence.
- Reads: Next.js **Server Components**. Mutations: Node-runtime **route handlers** under `app/api/**`.
- **No authentication** (v1 scope).
- Localhost only: direct host execution binds to `127.0.0.1:3300`; in Docker the container listens internally on `0.0.0.0:3300`, and the host publishes only `127.0.0.1:3300:3300`.

## 3. Project directory structure (explicit)

```
videographer-manager/
├── AGENTS.md
├── README.md
├── package.json
├── package-lock.json
├── tsconfig.json
├── next.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── .gitignore
├── .env.example
├── .dockerignore
├── Dockerfile                 # production, Node 24 LTS, listens on 0.0.0.0:3300 internally
├── docker-compose.yml         # optional, publishes only 127.0.0.1:3300:3300, volume for data/
├── data/                      # SQLite runtime (git-ignored)
│   ├── app.db
│   └── backups/
├── docs/
│   ├── product-plan.md
│   ├── data-model.md
│   └── implementation-plan.md
├── public/
├── scripts/
│   ├── migrate.ts             # up (tsx)
│   ├── rollback.ts            # down (tsx), user-approved only
│   └── backup.ts              # SQLite .backup into data/backups/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx           # dashboard (M3)
│   │   ├── globals.css
│   │   ├── health/route.ts    # 200 probe used by G4
│   │   ├── clients/
│   │   │   ├── page.tsx
│   │   │   └── [id]/
│   │   │       ├── page.tsx
│   │   │       └── edit/page.tsx
│   │   ├── projects/…         # same list / [id] / [id]/edit shape
│   │   ├── shoots/…           # equipment checklist UI lives under shoots/[id]
│   │   ├── tasks/…
│   │   ├── deliverables/…
│   │   ├── quotes/…
│   │   └── invoices/…
│   ├── app/api/
│   │   ├── clients/…          # POST, PATCH only (archive toggle via PATCH flag)
│   │   ├── projects/…
│   │   ├── shoots/…           # POST/PATCH
│   │   ├── shoots/[id]/equipment-items/…  # equipment checklist handlers
│   │   ├── tasks/…
│   │   ├── deliverables/…
│   │   ├── quotes/…
│   │   └── invoices/…
│   ├── components/
│   │   ├── forms/
│   │   ├── tables/
│   │   ├── dashboard/         # five dashboard panels (M3)
│   │   └── modals/            # duplicate-client confirmation, etc.
│   ├── lib/
│   │   ├── db/
│   │   │   ├── index.ts       # better-sqlite3 singleton + PRAGMAs
│   │   │   ├── schema-version.ts
│   │   │   └── migrations/
│   │   │       ├── 0001_initial.up.sql
│   │   │       └── 0001_initial.down.sql  # complete v1 schema pair, including archive columns
│   │   ├── domain/
│   │   │   ├── dates.ts
│   │   │   ├── money.ts
│   │   │   ├── statuses.ts
│   │   │   ├── archive.ts
│   │   │   └── rules.ts
│   │   ├── schemas/           # Zod (single source of truth)
│   │   │   ├── client.ts
│   │   │   ├── project.ts
│   │   │   ├── shoot.ts
│   │   │   ├── shoot-equipment-item.ts
│   │   │   ├── task.ts
│   │   │   ├── deliverable.ts
│   │   │   ├── quote.ts
│   │   │   └── invoice.ts
│   │   ├── repositories/      # typed, explicit SQL
│   │   │   ├── kv-meta.ts
│   │   │   ├── client.ts
│   │   │   ├── project.ts
│   │   │   ├── shoot.ts
│   │   │   ├── shoot-equipment-item.ts
│   │   │   ├── task.ts
│   │   │   ├── deliverable.ts
│   │   │   ├── quote.ts
│   │   │   ├── invoice.ts
│   │   │   └── dashboard.ts    # the five dashboard queries
│   │   └── seed/
│   │       └── seed.dev.ts              # fictional seed data (see §5)
└── tests/
    ├── unit/
    ├── integration/
    └── e2e/
```

## 4. Fixed npm scripts (package.json)

```json
{
  "scripts": {
    "dev":         "next dev -H 127.0.0.1 -p 3300",
    "start":       "next start -H 127.0.0.1 -p 3300",
    "build":       "next build",
    "typecheck":   "tsc --noEmit",
    "lint":        "eslint .",
    "audit":       "npm audit --omit=dev --audit-level=high",
    "test":        "vitest run",
    "test:watch":  "vitest",
    "e2e":         "playwright test",
    "e2e:ui":      "playwright test --ui",
    "db:migrate":  "tsx scripts/migrate.ts",
    "db:rollback": "tsx scripts/rollback.ts",
    "seed:dev":    "tsx src/lib/seed/seed.dev.ts",
    "backup":      "tsx scripts/backup.ts"
  }
}
```

All scripts are required at the milestone they first apply to. All applicable checks must pass before a verified working-tree checkpoint that the user may choose to commit (see §6).

## 5. SQLite, migrations, backups, seed

### 5.1 PRAGMAs (set by `src/lib/db/index.ts` on every connection)

- `journal_mode = WAL`
- `foreign_keys = ON`
- `busy_timeout = 5000`
- `synchronous = NORMAL`
- `temp_store = FILE`
- `cache_size` and `page_size` remain SQLite defaults.

### 5.2 Migration ledger and runner

- **Version ledger:** `kv_meta.schema_version` is the **sole** schema-version ledger. Ledger table: `kv_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)`.
- **Bootstrap:** idempotently creates `kv_meta` and initializes `schema_version` to `"0"`. Bootstrap also supplies `kv_meta.updated_at` as an RFC-3339 UTC timestamp.
- **First migration:** `0001_initial` creates the remaining complete v1 schema, including archive columns. There is **no separate archive-flags migration**.
- **Pairing:** every migration is a pair `000N_<name>.up.sql` / `000N_<name>.down.sql` under `src/lib/db/migrations/`. No orphan `.up.sql` files are allowed.
- **Runner (`scripts/migrate.ts`):**
  1. Connect with §5.1 PRAGMAs.
  2. Run the idempotent bootstrap, then read `kv_meta.schema_version`.
  3. For each `.up.sql` with index greater than the current version, ascending, within one transaction:
     - Execute `.up.sql`.
     - `UPDATE kv_meta SET value = '<new>', updated_at = '<RFC-3339 UTC>' WHERE key = 'schema_version'`.
- **Rollback (`scripts/rollback.ts`):** for each pair in descending order, execute the `.down.sql` and its version update (`UPDATE kv_meta SET value = '<prev>', updated_at = '<RFC-3339 UTC>' WHERE key = 'schema_version'`) within one transaction; stop when the user aborts or the version reaches `"0"`.
- **Transactionality:** every up or down migration runs transactionally with its version update. A failed migration rolls back and leaves the previous version unchanged. Every version update also updates `kv_meta.updated_at`.
- **Rollback is user-approved (§6.1) and requires a successful backup first (§5.3).**

### 5.3 Backup requirements

- Backup location: `data/backups/app-<UTCstamp>.db`.
- A **successful backup is required before**:
  1. `db:rollback` (rollback).
  2. Destructive maintenance.
  3. Any **data-transforming migration**.
  4. `seed:dev --force` (forced replacement).
- **No backup is required before**:
  1. Ordinary route writes.
  2. Initial seed insertion into an empty database.
  3. A non-destructive (schema-only) migration.
- Method: SQLite online `.backup()` API (no raw file copy).
- **Backups are never pruned automatically**; operators remove them manually if they choose.
- Precondition: when a backup is required, the backup file must be non-empty and readable before the operation proceeds; otherwise the operation aborts.
- Automatic backups (scheduling, retention policy) are **out of scope for v1**; manual backup guidance above is the supported workflow.

### 5.4 Idempotent fictional seed (`seed:dev`)

- All seed rows are **fictional** (no real client PII, no real money).
- Seed is **idempotent**:
  - First run inserts the full fixed dataset and writes `kv_meta` key `seed:dev:applied = "1"`.
  - An ordinary repeated invocation is an idempotent no-op (exit 0).
  - Forced replacement (`--force`) requires **explicit user approval** and a **successful backup** (§5.3).
- Forced replacement deletes **only** records carrying the fixed fictional seed identifiers, in this deterministic child-first order: invoice → quote → deliverable → task → shoot_equipment_item → shoot → project → client — then re-inserts the full dataset within one transaction and re-sets `seed:dev:applied = "1"`. There is **no standalone `equipment_item` table** in this order. A backup is required before `--force` only; it is **not** required for initial insertion into an empty database.
- The seed creates **zero** rows attributable to real users.

## 6. Git and checkpoint policy (consistent with AGENTS.md)

- Work on a single feature branch per milestone.
- A **checkpoint** is a verified working tree with the applicable checks passing. Committing it is a user decision; the assistant does not commit automatically.
- **No Git commit, branch, or tag is created, and no push, pull, fetch, or any other contact with a Git remote, is performed by the assistant without explicit user instruction.**
- No CI-on-push, no GitFlow, no PRs.
- Rollback guidance always starts by inspecting `git status` and `git diff`.
- Restore only explicitly named files, and only with explicit user approval.
- Never recommend `git reset --hard` or any full-tree reset.
- `README.md` is an overview, not a binding document. The binding documents are `AGENTS.md`, `docs/product-plan.md`, and `docs/data-model.md`.

### 6.1 Explicit user-approval actions

Pause before any of the following:

1. Running `npm run db:rollback` on any database.
2. Deleting, moving, or pruning anything under `data/`.
3. Creating, renaming, or deleting any Git branch or tag; any `push`, `fetch`, or `pull`.
4. Adding or removing any npm dependency outside the fixed stack.
5. Manually editing `kv_meta` (including `schema_version`).
6. Seeding a non-dev database.
7. Exposing the app on any address other than `127.0.0.1:3300`.
8. Editing any binding document (`AGENTS.md`, `docs/product-plan.md`, `docs/data-model.md`).

## 7. Security and hardening

- v1 has **no authentication** and **no middleware**.
- Request-size validation belongs at **route-handler boundaries**, not in middleware.
- Route handlers validate inputs through the shared Zod schemas; `422` for validation failures, `400` for malformed JSON, `404` for unknown ids, `409` for duplicate-client warnings.
- Duplicate-client detection uses a **case-insensitive name plus normalized country** comparison. It never uses name plus email.
- Timestamps are SQLite `TEXT` containing **RFC-3339 UTC** values; the UI renders in the user's local timezone.
- Calendar dates remain `YYYY-MM-DD` and follow the timezone rules in `docs/data-model.md`.
- Money uses **integer minor units plus an ISO-4217 currency code**. Never assume cents or two decimal places; currency exponents come from the fixed mapping in `docs/data-model.md`.
- Statuses: only values named in `docs/data-model.md` are accepted per entity.
- The `data/` directory is never served by Next.js file routes; no `public/` alias maps there.
- Dockerfile: non-root runtime user; the container listens internally on `0.0.0.0:3300`; Docker publishes only `127.0.0.1:3300:3300`.
- Release audit command: `npm audit --omit=dev --audit-level=high` must pass for the committed `package-lock.json` before any release milestone is declared complete.
- Ordinary route mutations must not trigger automatic backups (see §5.3).

## 8. Milestones

Each milestone contains: deliverables, implementation order, tests, acceptance criteria, dependencies, risks, rollback/checkpoint, and non-goals.

---

### Milestone 1 — Foundation

**Deliverables**
- Repository skeleton per §3 (Next.js App Router, strict TS, CSS Modules, no UI library).
- `package.json` with the scripts in §4 and a committed `package-lock.json`.
- ESLint (Next.js preset) and TypeScript strict config passing cleanly.
- `src/lib/db/index.ts` singleton applying §5.1 PRAGMAs.
- Migration runner (`scripts/migrate.ts`, `scripts/rollback.ts`) with the `kv_meta.schema_version` ledger at `"0"` after bootstrap.
- `0001_initial.up.sql` / `0001_initial.down.sql` creating every table named in `docs/data-model.md`.
- Zod schemas for every entity, aligned to `docs/data-model.md`.
- Domain modules: `dates.ts`, `money.ts`, `statuses.ts`, `archive.ts`, `rules.ts`.
- Typed repositories (explicit SQL, no ORM) for every entity plus `kv-meta.ts`.
- Backup script (`scripts/backup.ts`) and seed script (`src/lib/seed/seed.dev.ts`).
- Vitest harness with unit and integration suites as listed below.

**Implementation order**
1. `npm init`, `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`.
2. Next.js App Router scaffold (`src/app/layout.tsx`, `src/app/page.tsx` placeholder, `/health` route).
3. `src/lib/db/` (PRAGMAs, ledger bootstrap, migration runner, rollback).
4. Migration pair `0001_initial`.
5. Zod schemas in data-model order: client → project → shoot → shoot_equipment_item → task → deliverable → invoice → quote → kv_meta.
6. Domain modules (dates, money, statuses, archive, rules).
7. Repositories (typed, one per entity), each paired with an integration test.
8. `scripts/backup.ts` and `src/lib/seed/seed.dev.ts` (with `--force`).
9. Vitest: PRAGMA snapshot, migration up/down and failure rollback, seed idempotency, and backup-policy tests.

**Tests**
- `pragmas_wal_fk_on` — asserts `journal_mode == WAL` and `foreign_keys == 1` on a fresh connection.
- `migration_0001_up_then_down` — bootstrap + up + down returns `kv_meta.schema_version` to `"0"` transactionally.
- `migration_failure_preserves_version` — a failing migration rolls back its schema and version update.
- `kv_meta_internal_schema_version` — `kv_meta` is not reachable from application UI/routes and is the sole version ledger.
- `repository_crud_<entity>` — one per applicable entity; archive toggles are tested only for the six archive-protected records.
- `dates_and_timezones` — RFC-3339 UTC timestamps, calendar-date semantics, local shoot time, user-zone overdue calculation, and DST boundaries.
- `money_minor_units_by_currency` — integer arithmetic and the fixed ISO-4217 exponent mapping, including zero-decimal currency coverage.
- `statuses_enum_only` — non-enum status values return Zod errors.
- `seed_idempotency` and `seed_force` — first apply is idempotent on repeat; `--force` re-creates the same fixed rows.
- `backup_policy` — backup is required for rollback, destructive maintenance, data-transforming migrations, and forced seed replacement, but not ordinary writes, initial seed, or non-destructive migrations.

**Acceptance criteria**
- `npm run dev`, `start`, `build`, `typecheck`, `lint`, `audit`, `test`, `db:migrate`, `db:rollback`, `seed:dev` all succeed from a clean checkout on Node.js 20.19.2+.
- No direct `fs` access to `data/` outside `src/lib/db/`.
- Every repository method accepts a Zod-validated input type.
- PRAGMA, migration, seed, and backup tests are all green.

**Dependencies**
- Node.js 20.19.2+ on the developer machine.
- npm with network access for the initial install only.
- No external services.

**Risks**
- `better-sqlite3` native build failure on the dev machine's Node → pin Node 20.19.2+ in the README and in CI-less local dev guidance.
- Migration ordering mistakes → mitigated by the version-gated runner and by requiring paired `.down.sql` for every `.up.sql`.
- Timezone drift between UI and storage → central `dates.ts` and unit tests.

**Rollback / checkpoint**
- Each implementation step ends in a verified working-tree checkpoint that the user may choose to commit.
- Any migration change is paired up/down and tested before the checkpoint.
- To undo work, inspect `git status` and `git diff`, then restore only explicitly named files with user approval.

**Non-goals**
- No CI, no Docker, no Playwright e2e.
- No UI beyond `/health`.
- No auth, no Postgres, no Express or Fastify, no OpenAPI or Swagger, no JWT, no Jest or ts-node.

---

### Milestone 2 — Management interface and route handlers

**Deliverables**
- Server Component pages (list, detail, edit) for clients, projects, shoots, tasks, deliverables, quotes, and invoices; equipment checklist controls live only on shoot detail pages.
- Node-runtime route handlers under `app/api/**` for every mutation (POST create, PATCH update, including archive-toggle) per entity defined in `docs/data-model.md`.
- **Duplicate-client confirmation flow**:
  - `POST /api/clients` returns `409 { duplicate: [ids] }` for a case-insensitive name plus normalized-country match.
  - The UI surfaces the existing client(s) and requires an explicit checkbox "I confirm I am creating a new, distinct client"; the resubmit includes `confirmation: true` and is the only path that creates the new row.
- **Archive-only policy** enforced end-to-end:
  - The six archive-protected records — client, project, shoot, task, deliverable, invoice — expose archive and unarchive as reversible state changes.
  - **No `DELETE` route handler exists on any entity.**
  - `quote` and `shoot_equipment_item` follow parent visibility per `docs/data-model.md`; they carry no independent archive flag and no independent archive endpoint.
- Zod-driven form components (shared form builder) reused by every edit page.
- Vitest suites for PRAGMAs, constraints, dates, timezones, money, statuses, route validation, archive, and child visibility.

**Implementation order**
1. Shared Zod-driven form component.
2. List pages for the seven top-level record types; equipment items remain nested under shoot detail.
3. Detail pages for the seven top-level record types.
4. Route handlers in data-model order, with `shoot_equipment_item` handlers nested beneath `shoots/[id]/equipment-items`.
5. Archive-toggle PATCH surface on the six archive-protected records.
6. Duplicate-client detection + confirmation flow (route + UI + test).
7. Child-visibility enforcement for `quote` and `shoot_equipment_item` (list/detail filtered by parent status; no independent archive endpoint).
8. T-ARCH-001 … T-ARCH-004 tests from `docs/data-model.md` all present and green.

**Tests** (Vitest, in `tests/integration/`)
- `duplicate_client_confirm_and_save` — **required, this name must appear verbatim**:
  1. Create client A with name `Acme Studio` and country `FR`.
  2. POST client B with name `acme studio` and normalized country `FR` without confirmation → `409` and a non-empty `duplicate` array containing A's id.
  3. POST client B again with `confirmation: true` → `201`, a second distinct row is now returned by the list.
- `archive_project_cascades` — T-ARCH-001 exactly as defined in `docs/data-model.md`, including retained quote/checklist rows and non-cascading unarchive.
- `archive_unarchive_only` — T-ARCH-002: route/service registration exposes archive and unarchive but no permanent-delete operation.
- `archived_visibility_filters` — T-ARCH-003: archived rows are hidden from default views and shown by the explicit archived view.
- `client_unarchive_keeps_projects_archived` — T-ARCH-004: restoring a client does not restore its projects.
- `child_visibility_follows_parent` — quote and checklist rows remain stored and follow parent visibility without independent archive state.
- `pv_constraints_<entity>` — NOT NULL, CHECK, and UNIQUE constraints for each entity surface.
- `dates_and_timezones` — write paths preserve timestamp, calendar-date, local-time, user-zone, and DST rules.
- `money_minor_units_by_currency` — values are integer minor units and validation follows the fixed currency-exponent map.
- `statuses_reject_unknown` — `422` for any status not named in `docs/data-model.md`.
- `route_validation_zod_sole` — no route handler references a regex-based validator or a hand-written field check; Zod is the only validation entry.

**Acceptance criteria**
- Every top-level record type has the planned management UI/routes; equipment checklist operations are nested beneath a shoot.
- Duplicate-client flow works in both the API and UI and is covered by the named test above.
- Archive-only policy is enforced: no `DELETE` endpoint, archive is reversible, `quote` and `shoot_equipment_item` follow parent visibility.
- T-ARCH-001 … T-ARCH-004 are all present and green.
- `npm run test` passes from a clean checkout.

**Dependencies**
- Milestone 1 fully green.
- Node.js 20.19.2+.

**Risks**
- UI form errors leaking into route handlers → the shared Zod schemas are the single source of truth and the shared form component reuses them.
- Archive semantics mis-read → all archive logic lives in `src/lib/domain/archive.ts` and is covered by T-ARCH-001/002.
- Duplicate detection false-positives → matching is case-insensitive name plus normalized country; explicit user confirmation remains mandatory.

**Rollback / checkpoint**
- One verified working-tree checkpoint per coherent entity slice (form → list → detail → handler → tests); the user decides whether to commit.
- Any schema change is paired up/down and tested; data-transforming migrations require a successful backup first.

**Non-goals**
- No dashboard panels (M3).
- No Docker (M4).
- No auth, no roles, no permanent delete, no import/export, no external integrations.
- No `DELETE` on any entity.

---

### Milestone 3 — Dashboard, workflows, responsive UI, and e2e

**Deliverables**
- Dashboard at `/`, composed entirely of Server Components and CSS Modules.
- Five panels implemented per `docs/product-plan.md`: active projects, upcoming shoots, overdue tasks, deliverables awaiting review, and unpaid invoices. Each uses a dedicated query in `src/lib/repositories/dashboard.ts`.
- Every panel links to a filtered list representing the same records.
- Responsive layout verified at 375×667, 768×1024, and 1280×800.
- Native Playwright runner (`playwright.config.ts`) with a local `webServer` pointing at `npm run start`.
- Playwright specs:
  - `dashboard_happy_path` — seeded fixture; all five panels render correct data with zero console errors.
  - `duplicate_client_confirm_and_save_e2e` — mirrors the integration test at the UI level.
  - `responsive_smoke` — viewport matrix (375×667 / 768×1024 / 1280×800), no console errors.

**Implementation order**
1. Dashboard shell (`src/app/page.tsx`, `src/app/dashboard.css`).
2. Active-projects panel: repository query → component → filtered-list link.
3. Upcoming-shoots and overdue-tasks panels.
4. Deliverables-awaiting-review and unpaid-invoices panels, including amount due.
5. Empty states and cross-panel quick counts.
6. Responsive polish (breakpoints and mobile nav).
7. `playwright.config.ts` and the three specs above.
8. One full local `npm run e2e` pass against a seeded fixture.

**Tests**
- Vitest (integration, `tests/integration/`):
  - `dashboard_active_projects`, `dashboard_upcoming_shoots`, `dashboard_overdue_tasks`, `dashboard_deliverables_review`, and `dashboard_unpaid_invoices` — assert exact filtering, shape, totals, ordering, and empty states against a temp DB.
  - `dashboard_links_match_filters` — every panel link resolves to the same filtered records.
- Playwright (e2e, `tests/e2e/`):
  - `dashboard_happy_path`
  - `duplicate_client_confirm_and_save_e2e`
  - `responsive_smoke`

**Acceptance criteria**
- `/` renders all five dashboard panels with independently correct data and empty states.
- Dashboard filtering and totals live in `dashboard.ts`, not client-side calculations.
- Every panel link opens the corresponding filtered list.
- Responsive smoke passes at 375×667, 768×1024, and 1280×800 with no horizontal scroll at target widths and 44×44 CSS-pixel tap targets.
- `npm run e2e` passes from a clean checkout after `npm run seed:dev`.

**Dependencies**
- Milestone 2 fully green.
- Playwright browser binary installed once (`npx playwright install`).

**Risks**
- Dashboard-query drift → bind each panel to the exact definitions in `docs/product-plan.md` and `docs/data-model.md`, with independent integration tests.
- E2E flake on local timing → use Playwright's auto-wait and a fresh seeded fixture per spec.
- Server Components leaking client state → all dashboard panels remain Server Components; only form submissions are interactive.

**Rollback / checkpoint**
- Each dashboard slice ends in a verified working-tree checkpoint; the user may commit it.
- E2E specs are additive and never mutate persistent user data.

**Non-goals**
- No third-party UI library.
- No visual snapshot testing.
- No visual-regression CI.

---

### Milestone 4 — Security, Docker, docs, final verification

**Deliverables**
- Security hardening sweep per §7 (request size, header lockdown, no secrets in committed env files).
- **Production Dockerfile**:
  - Base image pinned to **Node.js 24 LTS**.
  - Non-root runtime user.
  - `EXPOSE 3300`.
  - Container listens internally on **`0.0.0.0:3300`**.
- `.dockerignore` excluding `data/`, `backups/`, `node_modules/`, `.git/`, `tests/e2e` artifacts.
- `docker-compose.yml` (optional) publishing only `127.0.0.1:3300:3300` and mounting persistent `data/` storage.
- Updated `README.md`: prerequisites, setup, dev, tests, migration/rollback backup policy, fictional idempotent seed behavior, manual backup/restore guidance, Docker operation, and the explicit-approval list from §6.1.
- The **five-gate verification pass** below, all green.

**Implementation order**
1. Security sweep (request size, `.env` audit, no secrets in the repo).
2. `Dockerfile`, `.dockerignore`, `docker-compose.yml`.
3. Backup-policy audit — no ordinary mutation hook; required operations enforce the §5.3 precondition.
4. `README.md` updates mirroring §6.1 and §7.
5. Five-gate pass (G1–G5).

**Tests**
- `data_path_not_served` — a request to any `app/**` file route that would resolve into `data/` returns `404`.
- `docker_bind_3300` — the container listens internally on `0.0.0.0:3300`, while Docker publishes only `127.0.0.1:3300:3300`.
- `backup_policy` — re-run as a regression under M4.
- `no_outbound_runtime_calls` and `secret_pii_scan` — security review checks from product acceptance criteria 16 and 19.
- Full regression: `npm run typecheck && npm run lint && npm run audit && npm run test && npm run e2e`.

**Five-gate verification pass**

| Gate | Command / check | Pass condition |
|------|-----------------|----------------|
| G1 | `npm test` | all unit and integration suites green |
| G2 | `npm run typecheck` | strict TypeScript passes |
| G3 | `npm run lint` | ESLint passes with no untrusted-boundary `any` escape |
| G4 | `npm audit --omit=dev --audit-level=high` | zero high/critical advisories |
| G5 | `npm run build` | production build completes |

**Acceptance criteria**
- All five gates are green in the same working tree.
- `npm run e2e`, the migration round trip with its required rollback backup, Docker inspection/health, and the manual security review also pass.
- `README.md` documents the §6.1 explicit-approval list.
- The Docker container is not reachable from any non-loopback address.

**Dependencies**
- Milestones 1–3 all green.
- Docker locally for the additional release-verification checks; if absent, those checks are deferred with a written note.

**Risks**
- Node 24 LTS breaking `better-sqlite3` native build → pin a tested `better-sqlite3` in `package.json` and verify on both Node 20.19.2+ and Node 24 LTS before the G4 gate.
- Dev-machine port 3300 already in use → README instructs the developer to check first.
- Backup growth → automatic pruning is out of scope; README documents manual review and removal with explicit approval.

**Rollback / checkpoint**
- Each deliverable ends in a verified working-tree checkpoint; the user decides whether to commit.
- On failure, inspect the diff and restore only explicitly named files with user approval; no full-tree reset, force-push, or tag.

**Non-goals**
- No CI-on-push, no GitFlow, no release tagging, no artifact signing.
- No Postgres migration path.
- No visual snapshot tests.
- No external integrations, no SaaS, no email, no SMS, no object storage.

## 9. Test-mapping table — product-plan acceptance criteria 1–19

The exact wording of criteria 1–19 is binding per `docs/product-plan.md`. The short names below are used for navigation; when they disagree with the product-plan text, the product-plan text wins.

| # | Product-plan acceptance criterion (short name) | Primary test(s) | Milestone |
|---|-----------------------------------------------|-----------------|-----------|
| 1 | persistence survives build and restart | `persistence_restart` | M1 |
| 2 | WAL recovery after interrupted write | `pragmas_wal_fk_on`, `wal_unclean_shutdown_recovery` | M1 |
| 3 | CRUD plus archive/restore coverage for the defined record types | `repository_crud_<entity>`, T-ARCH suite | M2 |
| 4 | project requires a valid client | `project_client_fk_required` | M1 |
| 5 | integer minor-unit money with currency | `money_minor_units_by_currency` | M1 |
| 6 | closed status sets | `statuses_enum_only`, `statuses_reject_unknown` | M1/M2 |
| 7 | calendar, timestamp, local-time, timezone, and DST rules | `dates_and_timezones` | M1/M2 |
| 8 | W1 intake workflow end-to-end | `workflow_w1_intake` | M2/M3 |
| 9 | W2 operations workflow end-to-end | `workflow_w2_operations` | M2/M3 |
| 10 | W3 paid/overdue workflow end-to-end | `workflow_w3_get_paid` | M2/M3 |
| 11 | W4 archive and restore workflow | `workflow_w4_archive_restore`, T-ARCH suite | M2/M3 |
| 12 | five correct dashboard panels and empty states | five `dashboard_*` query tests, `dashboard_happy_path` | M3 |
| 13 | dashboard links match filtered lists | `dashboard_links_match_filters` | M3 |
| 14 | required quality commands pass | G1–G5 | M4 |
| 15 | strict TypeScript and no untrusted-boundary `any` | `npm run typecheck`, `npm run lint` | M4 |
| 16 | no runtime egress, secrets, or alternate persistence | `no_outbound_runtime_calls`, `data_path_not_served`, manual review | M4 |
| 17 | responsive usability at reference/target viewports | `responsive_smoke` | M3 |
| 18 | archival preserves and restores referenced data | T-ARCH suite | M2 |
| 19 | committed tree contains no secret or real PII | `secret_pii_scan` | M4 |

## 10. T-ARCH tests (as defined in `docs/data-model.md`)

| ID | Requirement (as defined in `docs/data-model.md`) | Test name | Milestone |
|------|---------------------------------------------------|-----------|-----------|
| T-ARCH-001 | Archiving a project archives its shoots, tasks, deliverables, and invoices; quote/checklist rows remain stored and follow parent visibility; restoring the project does not restore its protected children automatically. | `archive_project_cascades` | M2 |
| T-ARCH-002 | UI and route/service integration expose archive and unarchive only; no permanent-delete operation is registered. | `archive_unarchive_only` | M2 |
| T-ARCH-003 | Archived records are absent from default lists, dashboard panels, and dropdowns but appear in the explicit archived view. | `archived_visibility_filters` | M2/M3 |
| T-ARCH-004 | Restoring a client leaves its projects archived for individual restoration. | `client_unarchive_keeps_projects_archived` | M2 |

These four tests are binding and must be present and green before their milestone closes.

## 11. Backup and rollback rules (summary)

- Backup is required before rollback, destructive maintenance, a data-transforming migration, and `seed:dev --force`.
- No backup is required for ordinary route writes, initial seed insertion into an empty database, or non-destructive migrations.
- Location: `data/backups/app-<UTCstamp>.db`. Backups are never pruned automatically.
- Rollback is always manual, always user-approved (§6.1), and always backed up first.
- Automatic/scheduled backup is outside v1; README provides the supported manual procedure.
- No automatic rollback. A failed migration rolls back its transaction and leaves `kv_meta.schema_version` unchanged.

## 12. Explicit-approval checklist (mirror of §6.1, README-ready)

- `db:rollback` on any database.
- Destructive maintenance or deleting, moving, or pruning anything under `data/`.
- `seed:dev --force`, or seeding any non-development database.
- Any assistant-created commit, branch, or tag; branch/tag rename or deletion.
- Any `push`, `fetch`, `pull`, or other remote contact.
- Adding or removing a dependency outside the fixed stack.
- Manual edits to `kv_meta`, including `schema_version`.
- Exposing the app on any address other than `127.0.0.1:3300`.
- Editing a binding document: `AGENTS.md`, `docs/product-plan.md`, or `docs/data-model.md`.

## 13. Five-gate pass (M4 exit gate)

- G1 — `npm test`.
- G2 — `npm run typecheck`.
- G3 — `npm run lint`.
- G4 — `npm audit --omit=dev --audit-level=high` (zero high/critical).
- G5 — `npm run build`.

Release verification additionally requires `npm run e2e`, the backed-up
migration up/down round trip, Docker build/inspection and `/health`, and the
manual security review. The container listens on `0.0.0.0:3300` internally;
Docker publishes only `127.0.0.1:3300:3300`.

## 14. Out of scope (final, binding)

- No authentication of any kind.
- No permanent hard deletion or automatic/scheduled backups.
- No external integrations, no SaaS, no email, no SMS, no object storage.
- No visual snapshot testing.
- No CI-on-push, no GitFlow, no release tagging, no artifact signing.
- No Postgres or any non-SQLite backend.
- No Express or Fastify or any non-Next.js HTTP server.
- No OpenAPI or Swagger.
- No Jest or ts-node; only Vitest and tsx.
- Seed data is fictional and idempotent.
- `data/` is the only persistence target.

— end of document —
