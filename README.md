# CLCKD

## Focus production workflow

Open `http://127.0.0.1:3300/`, choose New project, define a client, named approver
and output specifications, then use Brief → Outputs → Shoot → Review → Delivery.
Film and photography presets create separate outputs. Record the scope agreed
outside CLCKD, submit HTTPS review links (bare web addresses are normalized), explicitly confirm reported approvals,
and record each external handover. Undo before delivery preserves the original
event; after delivery record a correction request. Wrap requires all outputs
delivered. Reloading or restarting retains the project and version history.

This is a local access pilot: owner sign-in protects management pages/actions,
and one-use, expiring invitations grant a project-scoped read-only client session.
Public sharing, client identity verification, payment processing and subscriptions
are not implemented. Recorded
client decisions are reports entered by the operator, not verified signatures.
Existing projects are migrated without fabricated approval or delivery history.
The pre-workflow database backup is git-ignored at
`data/app.before-focus-20261011.sqlite` when an existing database was present.

For isolated local browser testing, `CLCKD_DB_PATH` can override the runtime
database path. Default storage remains `data/app.db`. Tests use temporary
databases and must never seed or clear the real application database.

## Owner and client access (local pilot)

On first launch, open `/access`. Read the one-time 12-character setup code
(formatted `XXXX-XXXX-XXXX`; spaces, hyphens and letter case are ignored) from the local
`data/owner-setup-code` file using the command shown on that page, then choose
your own passphrase (at least 15 characters). Do not paste secrets into chats.
The setup code is created with owner-only file permissions and is never returned
by a web endpoint. There is one local owner, not a public registration flow.
Older 64-character setup files are automatically converted to the short format;
previously copied long codes still work. The five-attempt/15-minute safeguard
remains in place. Setup is one-time; subsequent sign-ins need only the passphrase.
Owner sessions last eight hours. Keep your passphrase safe: account recovery is
not yet implemented. Existing production data is preserved by setup.

Open a project → Client access → Create a read-only invitation. Select the
outputs whose submitted review links may be shared; payment terms are optional.
Copy the one-use invitation and open it in a private browser window for testing.
The token is a URL fragment, removed from the address bar before claim; only
hashed tokens are stored. Invitations expire after 1/7/30 days and can be revoked,
which also blocks active client sessions. A shared output includes future
submitted versions; unsubmitted draft links and unselected outputs are excluded.

Guest requests are checked against their assigned project on every read. They
receive a separate minimal payload, not internal notes, other projects, private
receipt evidence or management actions. Changes to the URL or cookie name do
not grant owner access. All owner mutations require an authenticated owner and
a matching request origin. Credentials are scrypt-hashed; sessions use opaque
random tokens in HttpOnly, SameSite=Strict cookies. HTTP cookies are local-only:
the pilot rejects non-localhost request hosts and cannot be publicly deployed
as a paid service without further authentication, billing and launch hardening.
Invitations prove possession of an access link, not a verified person, approval
signature or work credential. External media hosts control download/privacy.

CLCKD is a local-first production management application for solo videographers and very small video-production teams.

It helps manage the complete operational lifecycle around video work:

Client
→ Project
→ Shoot
→ Post Production
→ Review
→ Delivery
→ Payment

CLCKD is designed to feel like a production workspace rather than generic CRM or enterprise project-management software.

---

## Status

**Active development — v1**

The project already contains application infrastructure and working functionality.

The current development focus is building the core production experience on top of the existing technical foundation.

---

## v1 Areas

CLCKD manages:

* Clients
* Projects
* Shoots
* Tasks
* Deliverables
* Quotes
* Invoices
* Production dashboard

All v1 application data is stored locally in SQLite.

---

## Product Boundaries

v1 is:

* single-user;
* local-first;
* desktop-first;
* tablet-friendly;
* offline-capable.

v1 does not include:

* cloud sync;
* public registration and cloud account services;
* multi-user accounts;
* public deployment;
* payment processing;
* media hosting/transcoding;
* email/calendar integrations.

---

## Documentation

### `AGENTS.md`

Persistent instructions for coding agents working on CLCKD.

### `docs/product-plan.md`

Product vision, target user, workflows, UX philosophy and v1 feature scope.

### `docs/data-model.md`

Authoritative technical contract for entities, fields, relationships, statuses, money, dates and archive behavior.

### `docs/implementation-plan.md`

Current development roadmap and feature-level implementation phases.

---

## Development

Typical commands:

```bash
npm ci
npm run dev
npm test
npm run typecheck
npm run lint
npm run build
```

The development server is intended for local use. Use Node.js >=20.19.2 and
install dependencies in the same operating system/container that runs the app;
`better-sqlite3` uses native binaries. Run verification in a separate terminal
from the development server. Pending SQL migrations apply automatically when
the server first opens the application database; there is no `db:migrate` script.

For a host-only launch, first open `/access`, then read the generated setup code
locally (do not share the output):

```bash
node -e 'process.stdout.write(require("node:fs").readFileSync("data/owner-setup-code", "utf8"))'
```

The Docker command on the setup screen applies only when using the existing
`clckd-preview` container. Project-owned Docker packaging is not yet provided.

Runtime application data lives under `data/` and must remain out of Git.

---

## Guiding Principle

CLCKD should make running video work simpler.

The user should open it and quickly understand:

* what needs attention;
* what is being shot next;
* where projects stand;
* what needs review;
* what is still unpaid.

The application should reduce management overhead rather than create more of it.

---

## License

Proprietary — all rights reserved.

---
