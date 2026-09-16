# CLCKD

A local-first management application for solo videographers and small video-production
studios.

**Status:** Planning phase (v1). No application code exists in this repository yet.
See `docs/` for the authoritative plans.

## What it will be (v1)

A single-user, local-first web app built with **Next.js 16, React 19, TypeScript
(strict mode), and SQLite** that manages:

- **Clients** — contact details and relationships to work
- **Projects** — client, title, status, dates, location, budget, notes
- **Shoots** — date, call time, location, crew notes, equipment checklist
- **Tasks** — priority, due date, status, linked project
- **Deliverables** — type, due date, review status, revision count, links
- **Money** — quote amount, invoice status, payment status, payment due date
- **Dashboard** — active projects, upcoming shoots, overdue tasks,
  deliverables awaiting review, unpaid invoices

All data persists locally in a SQLite database **under this project directory**.
No cloud services, analytics, tracking, email, calendar services, payment
processing, or media uploads/transcoding in v1.

## Non-goals (v1)

- Multi-user support or authentication
- Cloud sync, backups to remote storage, or deployment beyond localhost
- Email, calendar integrations, notifications
- Invoicing/payment processing (we track status only; we do not create, send,
  or collect payments)
- Media file uploads, storage, or transcoding (deliverables store *links*)
- Public deployment — Docker (future) publishes only `127.0.0.1:3300`

## Planned commands (to be introduced in implementation milestones)

```bash
npm install          # install dependencies (not done yet)
npm run dev          # start dev server on localhost
npm test             # run test suite
npm run typecheck    # TypeScript strict typecheck
npm run lint         # ESLint
npm run build        # production build
npm run db:migrate   # apply SQLite migrations (planned)
```

*These commands are aspirational until the corresponding milestone lands.*

## Documentation

| File | Purpose |
|---|---|
| `AGENTS.md` | Binding rules for any AI agent or developer working in this repo |
| `docs/product-plan.md` | Target user, workflows, MVP features, non-goals, acceptance criteria |
| `docs/data-model.md` | Entities, fields, relationships, statuses, money/time rules, deletion |
| `docs/implementation-plan.md` | Milestones with tests and rollback points |

## Security and data rules

- No credentials or secrets ever committed to source control.
- The app must never contact external services at runtime (v1 is offline).
- Any Docker Compose configuration must publish only `127.0.0.1:3300`.
- The SQLite database file lives under this project directory (planned
  location: `data/`), is git-ignored, and is the single source of truth.

## License

Proprietary — all rights reserved (private use).
