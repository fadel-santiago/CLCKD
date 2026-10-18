# Reusable local demo

Use the real CLCKD application with an explicitly isolated database. No demo
password, owner account, session, setup code or database is committed.

## Start on a Mac

Use a checkout installed with Node 22.23.3 on macOS. If necessary, follow the
[clean installation instructions](../README.md#getting-started) first. Do not
reuse Linux `node_modules` or replace dependencies in a checkout currently
shared with a running Linux container; use a separate clean Mac checkout.
These new demo commands must be present in that checkout before running them.

From the project folder:

```bash
nvm use
export CLCKD_DB_PATH="$PWD/data/demo/clckd-demo.db"
npm run demo:setup
npm run demo:seed
npm run demo:dev
```

Open **http://127.0.0.1:3301/access**, enter the actual setup code printed by
`demo:setup`, and choose your own passphrase of at least 15 characters.
Use a **separate browser profile or private window** for the demo. Cookies are
shared across ports on the same hostname; signing into a demo in the normal
workspace's browser profile can replace its owner cookie and require sign-in again.
Then open Today. The one-time code is not your sign-in passphrase.
Seeding before owner setup is supported and creates no credentials.
If you prefer, run `demo:dev` immediately after setup, create the owner, stop
the server, then seed and reopen it. Both orders preserve the same owner.

The commands deliberately ignore env-file database defaults: each requires an
explicit shell `CLCKD_DB_PATH`, restricted to this checkout's
`data/demo/clckd-demo.db`. Normal `data/app.db`, arbitrary paths, symlinked
directories/files and hard-linked databases are refused. Existing unmarked
business records are refused before migrations or seeding. A dedicated SQLite
application-header marker identifies databases initialized by the demo tool;
no production schema or business rules are changed.

## Reopen later

```bash
cd /path/to/CLCKD
nvm use
export CLCKD_DB_PATH="$PWD/data/demo/clckd-demo.db"
npm run demo:dev
```

Use your existing demo owner passphrase. Setup and seeding can be repeated,
but do not reset data, rotate credentials, duplicate records or refresh dates.
Stop with Ctrl+C. Clear the demo variable with `unset CLCKD_DB_PATH` before
returning to normal application commands. Do not run demo and normal dev
servers in the same checkout simultaneously: Next.js development files are
shared even though their databases and ports differ.

## Fictional recording scenario

| Project | State and walkthrough |
| --- | --- |
| Northstar Creative Studio / Autumn Brand Campaign | Post-production; €12,000 fee, 30/30/40 milestones; €7,200 recorded externally received, €4,800 outstanding. |
| Fieldwork Coffee / Coffee, People & Place | Booked, with an upcoming 08:30 Europe/London shoot and preparation work. |
| Lumina Studio / Product Launch Film | Completed through real scope, review, approval, delivery and wrap operations. |

The main project has studio-interview and location shoots, six completed tasks,
Process client feedback in progress, and Finish approved masters still to do.
Brand Film is approved and delivered. Social Media Edits v1 retains requested
changes; v2 awaits review. Promotional Cutdown is not submitted yet: that is
the supported editing/pre-review state, not a fabricated status.

Dates are relative to the **first seed date**. Reopening preserves the recording
baseline and any rehearsal edits. No automatic date shifting is performed.
Shoot completion is project-level; the app does not independently certify each
shoot. Review links use fictional HTTPS `example.com` addresses, not playable
video. Approvals and payments are operator-entered demonstration records,
not client identity verification, signatures, bank confirmation or transactions.

Suggested walkthrough: Today → Clients → Projects → main Brief → Shoot → Work
→ Review (select Social Media Edits) → Delivery (select Brand Film) → Payments
→ Client preview → completed Lumina project. Create/update a task if desired;
those edits persist. Client preview here is the owner view, not proof of a
guest invitation claim or public sharing.

## Preserve a recording baseline

Before rehearsal, stop the demo server and all other demo connections, then
copy the **entire `data/demo/` directory** to a private backup outside Git using
Finder. Copy it only while closed so SQLite sidecars cannot change mid-copy.
The backup includes local credentials and must not be shared or committed.
No automated restore/reset command is provided. Restoring would replace
rehearsal data and sessions: decide explicitly which backup and destination
to use, preserve the current directory separately, and never target `data/app.db`.

## Verification

Focused coverage lives in `tests/integration/demo-workspace.test.ts`: explicit
path checks, symlink/hard-link rejection, refusal of existing non-demo records,
atomic seeding, exact milestone amounts, version history, persistence,
idempotence, owner preservation and no default credentials. Setup/seed/start
also check SQLite integrity and foreign keys on the selected demo database.
Runtime data and setup codes remain excluded by the existing `.gitignore`.

Verified on 16 October 2026 with Node 22.23.3 on macOS ARM64: 12 demo tests,
17 production-workflow tests and 25 payment-plan tests passed. Typecheck,
lint and whitespace checks passed; the full suite/build were not repeated.
The populated persistent demo has 3 clients, 3 projects, 4 shoots and 15 tasks,
passes SQLite integrity/FK checks, and has no owner or session records yet.
Rerunning seeding retained the existing records. A separate disposable demo
with random test-only credentials was used to inspect Today, Clients, Projects,
review history, delivery, payments, client preview and a completed project in
the browser. No new screenshots were taken.

The current shared checkout still contains Linux-native SQLite dependencies;
these were intentionally not replaced while the live container uses them.
Execution was verified with the existing clean Mac installation. Use a separate
Mac-native installation before recording; the persistent demo database remains
at the original checkout's `data/demo/clckd-demo.db`. A different checkout uses
its own isolated demo path and creates its own fictional baseline—do not
symlink `data/` or bypass the path guard to share a business directory.
