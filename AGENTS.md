# AGENTS.md — CLCKD Coding Agent Rules

You are the coding agent responsible for building and maintaining CLCKD.

Read this file before doing any work in this repository.

These are persistent repository instructions and should not need to be repeated in individual prompts.

---

## 1. Working Style

* Work only inside the current CLCKD repository.
* Inspect the existing code before making changes.
* Understand the requested feature end-to-end before coding.
* Reuse existing architecture and patterns when reasonable.
* Prefer complete, usable vertical features over many tiny implementation steps.
* Do not stop at scaffolding if the requested feature can reasonably be completed.
* Make normal technical decisions independently.
* Avoid asking the user about routine implementation details.
* Ask or stop only when a decision could:

  * destroy or overwrite data;
  * expose private information;
  * introduce significant cost;
  * change the product direction substantially;
  * require deployment or external communication;
  * perform destructive Git operations.

Do not create unnecessary planning documents, reports, abstractions, or placeholder systems.

The goal is to build CLCKD, not to produce documentation about building CLCKD.

---

## 2. Sources of Truth

Use these documents for different purposes:

1. `AGENTS.md`

   * How the coding agent behaves.

2. `docs/product-plan.md`

   * What CLCKD should do.
   * Product philosophy.
   * User workflows.
   * UX priorities.
   * v1 scope.

3. `docs/data-model.md`

   * Database entities and fields.
   * Status values.
   * Relationships.
   * Money rules.
   * Date/time rules.
   * Archive behavior.
   * Technical data invariants.

4. `docs/implementation-plan.md`

   * Current development phases.
   * What has been completed.
   * What should be built next.

5. `README.md`

   * Human-readable overview and entry point.

For user-facing work, read `docs/product-plan.md`.

For database or domain work, consult the relevant parts of `docs/data-model.md`.

Do not reread every technical document unnecessarily for a simple UI change.

---

## 3. Product Principle

CLCKD is made specifically for videographers and very small video-production teams.

It should feel like a production workspace, not generic CRM or enterprise project-management software.

Prefer workflows and language that make sense to a videographer.

Examples:

* Prepare Shoot
* Shoot Ready
* Start Post
* Awaiting Review
* Changes Requested
* Delivered
* Paid
* Wrap Project

Prefer contextual actions over generic database language such as:

* Create Record
* Modify Entity
* Update Object

The interface should help the user understand:

* What needs my attention now?
* What am I shooting next?
* Where does each project stand?
* What is waiting on a client?
* What needs editing?
* What has not been paid?

---

## 4. Engineering Rules

* Keep TypeScript strict mode enabled.
* Do not introduce `any` unless genuinely unavoidable and documented.
* Keep functions and components reasonably small.
* Validate untrusted input.
* Use the project's existing Zod validation layer.
* Use the existing SQLite architecture.
* Use migrations for database schema changes.
* Preserve the rules in `docs/data-model.md`.
* Prefer simple implementations over unnecessary abstractions.
* Reuse existing components and utilities where appropriate.
* Do not introduce a new dependency when the existing stack can solve the problem cleanly.

Current technical direction:

* Next.js App Router
* React
* TypeScript
* SQLite
* better-sqlite3
* Zod
* Vitest
* Playwright where end-to-end testing is genuinely useful
* CSS / CSS Modules

Do not replace the core stack unless explicitly instructed.

---

## 5. User Data

Never intentionally destroy real user data.

Archive-protected records must use the archive/restore behavior defined in `docs/data-model.md`.

Never commit:

* real client information;
* credentials;
* passwords;
* API keys;
* tokens;
* private financial information;
* production databases.

Runtime databases and generated data remain git-ignored.

---

## 6. Testing

Testing effort should match the risk of the change.

For normal development:

* test the important behavior being changed;
* add tests for meaningful business logic;
* add regression tests when fixing bugs;
* run relevant existing tests;
* run TypeScript checking when the change affects typed application logic;
* run linting for meaningful code changes.

Do not create large test suites for trivial styling or copy changes.

Do not repeatedly run the entire release verification pipeline after every small edit.

For major milestones, database migrations, large refactors, release checkpoints, or when explicitly requested, run:

1. `npm test`
2. `npm run typecheck`
3. `npm run lint`
4. `npm audit --omit=dev --audit-level=high`
5. `npm run build`

Never say a check passed unless it was actually run.

---

## 7. Safety

Without explicit user permission:

* do not `git push`;
* do not deploy;
* do not publish packages;
* do not rewrite Git history;
* do not run `git reset --hard`;
* do not run destructive database operations;
* do not permanently delete important project files;
* do not expose the application publicly;
* do not send project or user data to external services;
* do not modify files outside the repository.

Normal project-local package installation is allowed when necessary for an approved feature.

Do not install global packages or use `sudo`.

---

## 8. File Changes

You may create, edit, rename, move, or remove files inside the repository when reasonably necessary to complete an approved feature.

Do not create unnecessary files.

Keep generated artifacts out of Git, including:

* `node_modules`
* `.next`
* coverage
* runtime databases
* logs
* temporary files

Do not make Git commits unless explicitly requested.

---

## 9. Building Features

When asked to build a feature, aim for a complete usable vertical slice.

For example, if asked to build project management, do not stop after creating:

* a table;
* a schema;
* repository functions;
* an empty component.

Continue through the layers required for the feature to actually work in the app.

A complete feature may include:

UI → validation → application logic → persistence → relevant tests

Not every change requires every layer.

Avoid splitting straightforward features into artificial micro-milestones.

---

## 10. UX Changes

When implementing a user-facing feature:

1. Read the relevant product direction.
2. Inspect the existing UI.
3. Consider the whole workflow rather than only the requested component.
4. Maintain visual and interaction consistency.
5. Make common actions fast.
6. Keep forms concise.
7. Reduce unnecessary clicks.
8. Prefer useful empty states over blank screens.
9. Make the current project/shoot state immediately understandable.
10. Avoid dashboard clutter that does not help the user act.

CLCKD should reward returning to the app because the user immediately knows what to do next.

---

## 11. Before Finishing

Check:

* Does the requested feature actually work?
* Is it connected to the real application?
* Does it fit CLCKD's product direction?
* Did existing working behavior remain intact?
* Did I avoid unnecessary complexity?
* Did I test the important parts?
* Did I leave the repository in a usable state?

Then report concisely:

* what was completed;
* important files changed;
* checks/tests actually run;
* unresolved issues, if any.

Do not produce a long implementation essay unless the user asks for one.
