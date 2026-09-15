# Implementation Plan — Videographer Manager v1

## Status and binding documents

* **Read‑Only Implementation Plan** – this document
* **Product Plan** – [TO BE COMPLETED FROM docs/product-plan.md IN THE NEXT TASK]
* **Data Model** – [TO BE COMPLETED FROM docs/data-model.md IN THE NEXT TASK]

## Milestone 1 — Foundation and data layer
### Deliverables
* Core data access layer (CRUD) and repository interfaces
* In‑memory data store for early prototype
* Initial migration script

### Implementation order
1. Define TypeScript interfaces for domain entities.
2. Create generic repository pattern.
3. Implement SQLite adapter.
4. Create migration runner.
5. Write unit tests.

### Tests
* Unit tests for each repository method.
* Integration tests against SQLite database.

### Acceptance criteria
* CRUD operations perform correctly.
* Migrations are idempotent.
* Tests pass on CI.

### Dependencies
* Node.js 18+.
* SQLite3 via `better-sqlite3`.
* `ts-node` for running tests.

### Risks
* SQLite schema changes might break existing data.
* Type safety of raw SQL.

### Rollback/checkpoint
* Store migration metadata table.
* Maintain backup script that dumps the DB.

### Non-goals
* No support for external database providers.
* No replication or high‑availability.

## Milestone 2 — Management interface
### Deliverables
* REST API server (Express or Fastify).
* Basic CRUD endpoints for campaigns, shoots, assets.
* Swagger/OpenAPI spec.

### Implementation order
1. Set up HTTP server framework.
2. Add router layers.
3. Wire service layer to persistence.
4. Generate API docs.
5. Basic authentication stub.

### Tests
* Endpoint success response tests.
* Validation and error handling checks.

### Acceptance criteria
* All endpoints reachable and functional.
* OpenAPI spec validates.

### Dependencies
* Express/Fastify.
* `jsonwebtoken` for auth.
* `jest` or `vitest` for testing.

### Risks
* Security mis‑configuration.
* Performance under load.

### Rollback/checkpoint
* API versioning plan.
* Use database migration for schema evolution.

### Non-goals
* No rate‑limiting or caching in this first release.

## Milestone 3 — Integration and browser testing
### Deliverables
* End‑to‑end browser test suite with Playwright.
* CI pipeline for run on push.

### Implementation order
1. Scaffold Playwright config.
2. Write sample flow: create shoot → add assets → view dashboard.
3. Configure CI job.
4. Add assertions for UI states.

### Tests
* Playwright E2E scenarios.
* Visual regression snapshots.

### Acceptance criteria
* All flows successful.
* No critical JS errors in console.

### Dependencies
* Playwright.
* `jest-playwright` or native Playwright test runner.

### Risks
* Test flakiness on CI Windows vs macOS.
* Browser context isolation.

### Rollback/checkpoint
* Keep browser artifacts in separate branch.
* Use PR for test updates.

### Non-goals
* No accessibility testing yet.

## Milestone 4 — Security and release verification
### Deliverables
* Static analysis reports.
* Security hardening checklist.
* Release notes template.

### Implementation order
1. Run `eslint` + `prettier`.
2. Add `npm audit` reporting.
3. Integrate `npm ci` CI check.
4. Generate release notes.

### Tests
* Lint and test suite must pass.
* No high‑severity `npm audit` findings.

### Acceptance criteria
* Code style enforced.
* No vulnerable packages.
* Release artifacts signed.

### Dependencies
* ESLint, Prettier, @types/node.
* `npm` 9+.

### Risks
* Breaking changes from lint rules.
* Incorrect signing configuration.

### Rollback/checkpoint
* Tag Git commit before each release.
* Store signed artifacts.

### Non-goals
* No dynamic vulnerability scanning beyond `npm audit`.

## Proposed directory structure
```
src/
├─ api/          # HTTP layer
├─ services/     # Domain logic
├─ repositories/ # Data access
├─ models/       # TypeScript interfaces
├─ migrations/   # DB migration scripts
└─ tests/        # Unit & integration tests
docs/
├─ implementation-plan.md
└─ data-model.md
```

## Expected npm scripts
```json
{
  "scripts": {
    "start": "node dist/index.js",
    "build": "tsc",
    "test": "jest",
    "lint": "eslint src/**/*.ts",
    "prepare-migrations": "node scripts/migrate.js",
    "e2e": "playwright test"
  }
}
```

## Database migration strategy
* Maintain a `migrations` folder with timestamped files.
* Use `better-sqlite3-migrate` or custom script.
* Store applied migrations in a `schema_versions` table.

## Fictional seed‑data separation
* Keep `seed/` folder with JSON fixtures.
* Load seeds via `npm run seed:dev` or `node scripts/loadSeeds.js`.

## Git checkpoint strategy
* Follow GitFlow branching model.
* Create a `dev` branch for feature work.
* Merge into `main` only after passing CI.

## Actions requiring user approval
* Major API design changes.
* Switching from SQLite to Postgres.
* Third‑party integrations (e.g., payment, CDN).

[TO BE COMPLETED FROM docs/data-model.md IN THE NEXT TASK]

