# Implementation Plan — CLCKD v1

Checkpoint note — 16 October 2026: this feature roadmap was previously embedded
in README.md and is restored here so existing documentation links resolve.
The earlier, prescriptive plan remains in Git history; its unauthenticated API
architecture and unimplemented scripts do not describe the current application.

Current implementation: local owner access and restricted client invitations,
production projects, versioned output review/delivery, and external payment
milestones exist. Server Components read through repositories; server actions
handle mutations. Phase goals below are a roadmap, not claims that every item
is complete. Equipment management, deployment packaging, account recovery and
repeatable browser release verification remain unfinished. No public launch is
authorized by this document.

## 1. Purpose

This document describes the current feature-level roadmap for CLCKD.

It intentionally does NOT prescribe every file, function, repository method or coding step.

The coding agent should determine reasonable implementation details using the existing repository architecture.

Authority:

1. `AGENTS.md` — coding-agent behavior
2. `docs/product-plan.md` — product behavior and UX
3. `docs/data-model.md` — data/domain rules
4. `docs/implementation-plan.md` — development sequence
5. `README.md` — overview

---

## 2. Existing Technical Direction

Preserve the existing stack unless explicitly instructed otherwise:

* Next.js App Router
* React
* strict TypeScript
* SQLite
* better-sqlite3
* Zod
* Vitest
* Playwright when meaningful
* CSS / CSS Modules
* npm

Persistence remains local under `data/`.

Local owner authentication and project-scoped, read-only client invitations are
implemented. Public registration, subscription billing and remote sharing are
not implemented.

No public deployment in v1.

No runtime dependency on external services.

---

## 3. Development Method

Work in complete feature slices.

A normal mission should be large enough to produce something meaningfully usable.

Example:

> Build the complete Projects workspace.

The coding agent should independently determine whether that requires:

* schema usage;
* repositories;
* validation;
* server logic;
* pages;
* components;
* interactions;
* tests.

Do not stop after implementing only one internal layer unless blocked.

Avoid turning ordinary features into many tiny sequential prompts.

---

## 4. Phase 1 — Foundation

**Status: substantially implemented**

Foundation includes or should include:

* Next.js application;
* TypeScript strict mode;
* SQLite connection;
* migration system;
* shared validation;
* domain rules;
* repository layer;
* local persistence;
* test infrastructure;
* backup/migration safety;
* client-management foundation.

Do not rebuild working foundation code without a clear reason.

Fix inconsistencies when encountered.

---

## 5. Phase 2 — Core Application Shell

### Goal

Make CLCKD feel like one coherent application.

Build or refine:

* global navigation;
* application layout;
* Home/dashboard;
* consistent typography;
* status presentation;
* empty states;
* loading/error behavior;
* shared interaction patterns.

The shell should establish the visual language for the rest of CLCKD.

### Completion

The user can navigate naturally between the important parts of the application and understands where they are.

---

## 6. Phase 3 — Projects Workspace

### Goal

Make Project the operational center of CLCKD.

Build the project experience end-to-end.

The user should be able to:

* create a project;
* select its client;
* edit project information;
* understand its current stage;
* move through valid project states;
* archive and restore it;
* open a project and see its connected production information.

Project detail should aggregate:

* client;
* dates/location;
* shoots;
* tasks;
* deliverables;
* quote;
* invoices.

Do not make the project detail page feel like a collection of unrelated database tables.

### Completion

A real project can be created and managed through its lifecycle without leaving broken or placeholder flows.

---

## 7. Phase 4 — Home / Production Dashboard

### Goal

Make opening CLCKD immediately useful.

Home should prioritize action.

Surface:

* active projects;
* upcoming shoots;
* overdue tasks;
* deliverables awaiting review;
* unpaid/overdue invoices.

Each item should give useful context and link directly to the relevant work.

Avoid unnecessary charts.

Avoid a generic analytics-dashboard appearance.

### Completion

A videographer can open CLCKD and understand what needs attention within seconds.

---

## 8. Phase 5 — Shoot Workspace

### Goal

Build a production-day-focused shoot experience.

Support:

* shoot date;
* call time;
* location;
* timezone;
* crew notes;
* equipment checklist;
* project relationship;
* archive/restore.

Make equipment checking fast and touch-friendly.

Surface relevant shoot information from Home and Project detail.

### Completion

The operator can prepare for and manage the practical information around a shoot without needing another checklist app.

---

## 9. Phase 6 — Work & Tasks

### Goal

Support project-related work without turning CLCKD into a generic task manager.

Implement:

* task creation;
* priority;
* due date;
* status;
* project relationship;
* filtering/sorting;
* overdue behavior;
* archive/restore.

Tasks should appear contextually within projects and on Home when attention is required.

### Completion

The operator can understand and complete project-related actions without managing an elaborate productivity system.

---

## 10. Phase 7 — Post Production & Deliverables

### Goal

Make the post-production state of every active project obvious.

Implement:

* deliverable creation;
* type;
* title;
* due date;
* external link;
* review state;
* revision count;
* notes;
* archive/restore.

Design the UI around the real post-production flow:

Working
→ Submitted
→ Review
→ Changes / Approval
→ Final

Underlying stored values and transitions must remain compliant with `docs/data-model.md`.

### Completion

The user can see what is being worked on, what is with the client and what is finished.

---

## 11. Phase 8 — Quotes & Money

### Goal

Give the operator a simple financial picture of each project.

Implement:

* project quote;
* invoice creation;
* invoice status;
* payment status;
* issue date;
* due date;
* unpaid totals;
* overdue visibility;
* archive/restore where applicable.

v1 only tracks status.

Do not build:

* payment processing;
* PDF generation;
* accounting;
* tax reporting;
* automated invoice sending.

### Completion

The user can quickly answer:

> What am I still owed?

---

## 12. Phase 9 — Workflow Polish

After the primary workflows exist, review CLCKD as a whole.

Focus on:

* reducing unnecessary clicks;
* improving forms;
* better empty states;
* consistent terminology;
* project-stage visibility;
* dashboard usefulness;
* keyboard usability;
* tablet interaction;
* visual hierarchy;
* error recovery.

Remove obsolete placeholder UI and unused implementation artifacts.

Do not add features simply to make the application look more complex.

---

## 13. Phase 10 — v1 Verification

Once the complete v1 workflow exists, perform full verification.

Run:

```bash
npm test
npm run typecheck
npm run lint
npm audit --omit=dev --audit-level=high
npm run build
```

Also verify end-to-end:

### New Work

Client
→ Project
→ Quote
→ Task
→ Shoot

### Production

Shoot checklist changes persist.

Project status behaves correctly.

### Post

Deliverables can progress through valid review states.

### Payment

Invoice states behave according to `docs/data-model.md`.

Overdue invoices surface correctly.

### Archive

Protected records can be archived and restored without data loss.

### Persistence

Restarting the application preserves data.

---

## 14. Definition of Feature Complete

A feature is complete when:

* the user-facing workflow works;
* required persistence works;
* existing data rules are respected;
* important validation works;
* relevant tests pass;
* no obvious placeholder remains in the completed flow.

A feature is not complete merely because:

* a schema exists;
* a repository exists;
* an API exists;
* a component exists;
* tests exist.

The user must be able to actually use it.

---

## 15. Current Priority

Unless the user gives another priority, work toward this order:

Core application shell
→ Projects
→ Dashboard
→ Shoots
→ Tasks
→ Deliverables
→ Money
→ Workflow polish
→ Full v1 verification

When a higher-level feature depends on unfinished lower-level behavior, implement the required dependency as part of the same mission when reasonable.

Do not require a separate user prompt for every internal subtask.

---

## 16. Progress Updates

As phases are completed, update this document briefly.

Use statuses such as:

* Not started
* In progress
* Functional
* Complete

Do not expand this file into a development diary.

Git history is the detailed implementation record.
