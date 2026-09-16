# AGENTS.md — Rules for AI Agents (and humans) Working in This Repository

These rules are **binding**. If a user instruction conflicts with the read-only
safety rules in this file (rules 8–9), the safety rules win unless the user
explicitly and knowingly overrides — and even then, destructive or external
actions require explicit confirmation.

## 1. Scope

- Work **only inside `/workspaces/clckd`** (this repository).
- Do not read, write, install, or modify anything outside this directory,
  **except**: reading system/proxy environment, using already-installed
  toolchain, and (for builds) writing to the local `node_modules`/`.next`
  inside this repo.
- Do not touch other workspaces, shared system packages, or global
  dependencies.

## 2. Language and Code Quality

- **TypeScript strict mode** is mandatory: `"strict": true` (and all implied
  strict-family flags) must remain enabled in every `tsconfig.json`.
  Never add `strict: false`, `noImplicitAny: false`, or blanket `// @ts-ignore`.
  Targeted, justified `as` casts are permissible only with a comment
  explaining why.
- Prefer exhaustive switching over `any`; model every external input with a
  validated type (see rule 3).
- Keep functions small and typed; no non-null assertions on untrusted data.

## 3. Validation

- **Validate all inputs**:
  - every HTTP/RSC query parameter and form body (server-side, the source of
    truth — client checks are convenience only);
  - every value entering or leaving SQLite;
  - every CLI argument.
- Use a single shared validation layer (e.g., a runtime validator such as
  Zod or ArkType — final choice in `docs/implementation-plan.md` M1) behind
  typed schemas; no field is trusted from the browser, the environment, or
  the database.
- Enum/status values are validated against the allowed set in
  `docs/data-model.md`; unknown values must produce a validation error, never
  silent defaults.
- Money, dates, and IDs fail closed (reject) when malformed — never coerce.

## 4. Tests

- **Every behavior change ships with tests** in the same change.
  - Unit tests for domain logic (status transitions, money math, validators).
  - Integration tests for each repository/SQL behavior (CRUD + invariants)
    using a throwaway SQLite file, cleaned up after.
  - Acceptance tests for each milestone in
    `docs/implementation-plan.md` must pass before the milestone is closed.
- Tests must be deterministic and offline (no network, fixed seeds/locales).
- Run before declaring success:

  ```bash
  npm test            # full suite (vitest by plan)
  npm run typecheck   # tsc --noEmit
  npm run lint        # eslint
  npm run build       # next build
  ```

## 5. Verification Pipeline (order matters)

Before finishing any code task, run and pass **all** of:

1. `npm test`
2. `npm run typecheck`
3. `npm run lint`
4. `npm audit --omit=dev --audit-level=high` *(zero high/critical; report the
   rest honestly)*
5. `npm run build` (production build, no errors)

If a step cannot be run (e.g., missing toolchain), **state exactly why**
rather than skipping silently. Never claim a gate passed without running it.

## 6. Secrets and Data

- **No secrets, credentials, API keys, tokens, or personal data (GDPR-style
  care even for local data) in source control.** No `.env` with real values in
  the repo; only `.env.example` with placeholders.
- The SQLite database (planned: `data/`) is **git-ignored**. Only seed/demo
  data may exist, and only via a documented, idempotent seed script.
- Never `git add -f` anything matching `.gitignore`; never commit logs, dumps,
  or fixtures containing real client/financial data.

## 7. Environment

- Agent-side development and verification must work with **Node.js 20.19.2
  or newer**.
- The **production Dockerfile must use Node.js 24 LTS**.
- All npm dependencies must be installed **inside this project**
  (project-local `node_modules`, recorded in `package.json` via
  `npm install <pkg>`).
- Do **not** install global packages or use `sudo`.
- Do **not** use `npm --force` or `--legacy-peer-deps` without an explicit
  explanation in the change report.

## 8. No Push, No Deployment, No External Communication

- **Never** `git push`, `npm publish`, tag-release-to-remote, trigger CI
  remotes, or contact any external network service (APIs, CDNs, registries
  beyond the necessary npm install during build setup, telemetry).
- **Never deploy** anywhere. Future Docker Compose must publish **only**
  `127.0.0.1:3300`.
- Runtime app code must make **zero** outbound network calls (no fetch to
  non-localhost origins), no analytics, no telemetry.
- If a tool you are asked to run would contact the network beyond npm's
  package fetch, stop and ask.

## 9. No Destructive Deletion

- No `rm -rf` outside generated directories inside this repo (`node_modules`,
  `.next`, `data`) — and even then only the documented, idempotent path.
- No `git reset --hard`, `git clean -fdx`, rebase, or history rewriting
  without explicit user confirmation.
- Schema drops or data deletes require: an explicit migration pair (up **and
  down**), a backup copy of the SQLite file (outside `git`, e.g.,
  `data/backup-<timestamp>.sqlite`), and user confirmation naming the affected
  tables/data.
- Never hard-delete a client, project, or related entities if
  `docs/data-model.md` says they are archive-protected; use `archived_at`.

## 10. File and Process Hygiene

- Do not create files other than the planned set, without naming them in the
  change summary first.
- Keep generated artifacts (`.next`, `node_modules`, `data`, coverage)
  git-ignored.
- Do not commit. **Commits are made by the user or on explicit
  instruction.** (Exception: a user may explicitly instruct a commit; even
  then, no push.)
- Preserve `.git` (if present) exactly.

## 11. Definition of Done

A change is done when:

- [ ] All five verification gates in rule 5 pass (or each failure is
      explicitly explained with a proposed fix).
- [ ] New behavior has new tests; tests are green; no skipped tests introduced.
- [ ] No new secret, no new network call, no file outside the repo touched.
- [ ] Migration (if schema changed) has an `up` **and** `down`, and is applied
      to a copy of the dev database in the PR/summary.
- [ ] `README.md` or the relevant `docs/*` file updated if user-visible
      behavior, commands, or data locations changed.
- [ ] Summary lists: files changed, gates run and their results, any
      deviations from this file and the justification.
