Product Plan — CLCKD v1

Current implementation checkpoint — 12 October 2026

The accepted Focus direction is a calm dark workspace for film and photography.
Projects contain independently versioned outputs with specification, quantity,
deadline and revision allowance. The local operator records scope confirmation,
reported client decisions, corrections and external handover. A new revision
needs explicit intent and a change note; previous versions and decisions remain
stored. A project can be wrapped only after all active outputs are delivered.
Production and client records remain local and archive-only.

This checkpoint implements owner-authenticated management and local project
viewer invitations, but not verified client identities, paid SaaS access,
public credit verification or app-store distribution. It must not label
operator-entered decisions as independently verified client signatures.
Project chat remains excluded. Payments between client and creative remain
external; delivery does not automatically mark invoices paid.

Payment schedules are now configured at creation or in the project's Payments
tab: 50/50, 30/30/40, five equal stages or custom percentages. Each stage has an
explicit work/payment condition, optional due date and exact allocated amount.
The operator can record externally received payments or correct a mistaken
record; CLCKD never collects money or guarantees receipt. Contract reference
and commercial terms are records, not authenticated signatures. The distinct
read-only Client preview shows recorded checkpoints, review links and the
payment schedule, with restrained progress animation and reduced-motion support.
The owner preview remains available. A separate client route now supports scoped,
read-only access through an expiring, revocable invitation, for local testing only.

Creation is guided through Project, Outputs and Agreement with retained draft
fields and optional details. Payment conditions may explicitly gate production,
post-production or delivery. A payable-after-delivery milestone has no delivery
gate, avoiding circular requirements. These controls gate app workflows only.
Future paid owners manage the workspace; invited client guests must have
server-enforced project-scoped permissions, never a UI-only restriction. The
local preview does not grant guest access or claim authenticated project credits.

The access pilot has one owner secured by a locally held setup code and a chosen
passphrase. Guests cannot register as owners, manage records, record payments,
approve work or access other projects. Owners explicitly select shared outputs
and whether commercial terms are included. One-use invitations and their client
sessions are revocable and expire. Future submitted versions of selected outputs
are shared; drafts and unselected output links stay private in CLCKD. These access
controls are server-enforced, not UI-only. Local owner mode does not fabricate a
paid membership. Remote client sharing, multi-tenant subscriptions, recovery and
independent identity/credit verification are not yet launch-ready.

1. Product Definition
CLCKD is a local-first production management application designed specifically for solo videographers and very small video-production teams.
It helps the operator manage the business and production lifecycle of video work without turning their workflow into generic enterprise project management.
CLCKD should answer five questions immediately:
	1	What needs my attention now?
	2	What am I shooting next?
	3	Where does each project currently stand?
	4	What is waiting on me or the client?
	5	What money is still outstanding?
The application should feel like opening a production desk.
Not a spreadsheet.
Not a generic CRM.
Not a miniature version of Monday, ClickUp, or Notion.

2. Target User
Primary
A solo professional videographer working across areas such as:
	•	events;
	•	weddings;
	•	commercial / brand content;
	•	music videos;
	•	documentaries;
	•	social content;
	•	freelance production work.
They manage their own clients, projects, shoot preparation, post-production, delivery, and payment tracking.
Secondary
A very small production studio, typically an owner plus one partner or collaborator, where one operator primarily manages CLCKD.
Working Context
Desktop is primary.
Tablet should remain comfortable for production-day use.
The operator may use CLCKD before a shoot, during production preparation, during post-production, and while handling client/admin work.
v1 is single-user and local-first.

3. Product Philosophy
3.1 Production first
The product should be organized around the life of a video project rather than around database tables.
The normal lifecycle is:
Lead → Proposed → Booked → In Production → Post Production → Completed
The underlying values remain exactly as defined in docs/data-model.md.
The interface may present shorter, more natural labels where appropriate.

3.2 Attention before statistics
The home screen should prioritize things that require action.
Examples:
	•	shoot tomorrow;
	•	overdue task;
	•	equipment not ready;
	•	rough cut awaiting review;
	•	client requested changes;
	•	payment overdue.
Metrics are useful only when they help the user act.
Avoid filling the dashboard with decorative charts or numbers.

3.3 Contextual actions
Prefer actions that match production language.
Examples:
	•	Prepare Shoot
	•	Open Shoot
	•	Mark Ready
	•	Start Post
	•	Send for Review
	•	Changes Requested
	•	Mark Delivered
	•	Mark Paid
	•	Wrap Project
Avoid generic CRUD-style language wherever a more natural production term exists.

3.4 Low friction
Common operations should require as few steps as practical.
The user should not spend more time managing CLCKD than doing their actual work.
Forms should reveal complexity only when necessary.
Important information should be visible without repeatedly opening edit screens.

3.5 Calm but creative
CLCKD is professional software for creative people.
The visual direction should be:
	•	clean;
	•	modern;
	•	confident;
	•	slightly creative;
	•	information-dense when useful;
	•	never corporate-looking;
	•	never childish;
	•	never visually noisy.
Status, progress and urgency should be understandable at a glance.

4. Core Product Structure
The primary areas of CLCKD are:
Home
The production command center.
Shows what requires attention now.
Projects
The central object around which work is organized.
Shoots
Production dates, call times, locations, crew notes and equipment readiness.
Clients
People and organizations connected to projects.
Work
Tasks and post-production responsibilities associated with projects.
Deliverables
Edits, masters, thumbnails, social cuts and other project outputs.
Money
Quotes, invoices and payment status.
Navigation does not need to expose every database entity as an equally important top-level section.
UX hierarchy should reflect how frequently videographers need each area.

5. Primary Workflows
W1 — Take On New Work
The operator should be able to move naturally from an enquiry or opportunity into an organized production.
Typical flow:
Client → Project → Quote → Project preparation → Shoot
The user can:
	•	find or create a client;
	•	create a project;
	•	define its current stage;
	•	add planned dates and location;
	•	record budget and notes;
	•	record the quote;
	•	create tasks;
	•	create one or more shoots.
This should feel like preparing a job, not filling out a database.

W2 — Prepare and Run a Shoot
A shoot workspace should make production readiness obvious.
The user can see:
	•	project;
	•	shoot date;
	•	call time;
	•	location;
	•	crew notes;
	•	equipment checklist.
The interface should make incomplete preparation visible without becoming stressful or noisy.
The operator should be able to quickly check equipment items on a tablet.

W3 — Daily / Weekly Operation
Opening CLCKD should immediately surface:
	•	active projects;
	•	upcoming shoots;
	•	overdue tasks;
	•	deliverables requiring attention;
	•	unpaid or overdue invoices.
The user should not need to search through several pages to understand the state of their work.

W4 — Post Production
After production, the focus shifts from the shoot to deliverables.
The user should be able to understand:
	•	what is currently being edited;
	•	what has been submitted;
	•	what is awaiting client review;
	•	what received change requests;
	•	what has been approved;
	•	what revision is current.
Revision count changes only when explicitly requested by the user, as defined by the data model.

W5 — Get Paid
The operator records quote and invoice information associated with the project.
The interface should clearly distinguish:
	•	draft;
	•	sent;
	•	unpaid;
	•	partial;
	•	overdue;
	•	paid;
	•	void.
CLCKD tracks payment status only in v1.
It does not process payments.

W6 — Finish and Preserve History
Completed work should become quiet without disappearing.
Projects and other archive-protected records are archived rather than permanently deleted.
Historical client/project information remains accessible.

6. MVP Capabilities
Clients
	•	list clients;
	•	create clients;
	•	edit clients;
	•	archive and restore clients;
	•	see their projects;
	•	see outstanding invoice amount;
	•	warn about possible duplicates.
Client fields and duplicate rules are defined in docs/data-model.md.

Projects
	•	list projects;
	•	create projects;
	•	edit projects;
	•	archive and restore projects;
	•	link each project to a client;
	•	clearly show current production stage;
	•	show important dates;
	•	show location;
	•	show budget;
	•	show notes;
	•	aggregate shoots, tasks, deliverables, quote and invoices.
A project detail screen should become the operational home of that job.

Shoots
	•	one or more shoots per project;
	•	shoot date;
	•	call time;
	•	timezone;
	•	location;
	•	crew notes;
	•	equipment checklist;
	•	archive/restore according to the data model;
	•	surface upcoming shoots from Home.
The shoot interface should prioritize readiness.

Tasks
	•	project-linked tasks;
	•	title;
	•	description;
	•	priority;
	•	due date;
	•	status;
	•	filtering/sorting;
	•	overdue visibility.
Tasks are supporting objects.
CLCKD should not turn into a generic task-manager.

Deliverables
	•	project-linked deliverables;
	•	deliverable type;
	•	title;
	•	due date;
	•	review status;
	•	revision;
	•	external link;
	•	notes;
	•	archive/restore.
Post-production status should be understandable without opening every deliverable individually.

Money
Project-level quote tracking.
One or more invoices per project.
Track:
	•	amount;
	•	currency;
	•	invoice status;
	•	payment status;
	•	issue date;
	•	payment due date.
No payment gateway or accounting system in v1.

7. Home / Dashboard
The Home screen is CLCKD's most important view.
It should answer:
What needs my attention?
It should surface:
Active Projects
Prioritize projects currently moving through production.
Show useful context such as:
	•	client;
	•	project stage;
	•	important date;
	•	next relevant action.
Upcoming Shoots
Default window: next 14 days unless changed in settings.
Show:
	•	project;
	•	shoot date;
	•	call time;
	•	location;
	•	readiness context where available.
Overdue Tasks
Only unfinished tasks whose due date has passed.
Review Queue
Deliverables currently awaiting or undergoing client review.
Money Due
Invoices that remain unpaid, partially paid or overdue.
Show the amount and due date.

8. Interaction Principles
Show state visually
The operator should not need to read several fields to understand where a project stands.
Keep related work together
When working inside a project, shoots, tasks, deliverables and money should be accessible without mentally leaving that project.
Reduce navigation
Frequent operations should be reachable from the page where they make contextual sense.
Useful empty states
An empty area should explain what belongs there and offer the relevant action.
Strong hierarchy
Urgent work and next actions should be more visually prominent than metadata.
Avoid administrative language
Use natural wording wherever possible without hiding the underlying meaning.

9. v1 Technical/Product Boundaries
v1 remains:
	•	single-user;
	•	local-first;
	•	SQLite-backed;
	•	usable offline;
	•	desktop-first;
	•	tablet-friendly.
v1 does NOT include:
	•	authentication;
	•	multi-user roles;
	•	cloud synchronization;
	•	remote backups;
	•	public web deployment;
	•	email sending;
	•	calendar synchronization;
	•	push notifications;
	•	payment processing;
	•	accounting;
	•	PDF invoice generation;
	•	media upload/storage;
	•	transcoding;
	•	hosted review links;
	•	advanced analytics;
	•	crew/resource optimization;
	•	timesheets;
	•	expenses;
	•	phone-first mobile design.
External links may still be stored where allowed by the data model.

10. Data and Safety
docs/data-model.md remains the source of truth for:
	•	entity fields;
	•	relationships;
	•	valid status values;
	•	status transitions;
	•	money storage;
	•	date/time behavior;
	•	archive behavior;
	•	database invariants.
Product UX must respect those rules.
Do not duplicate detailed schema definitions in this document.

11. Success Definition
v1 succeeds when a solo videographer can manage a normal working day primarily through CLCKD.
The operator should be able to:
	•	understand current workload quickly;
	•	prepare upcoming shoots;
	•	track each project's production stage;
	•	know what needs editing or review;
	•	know what clients owe money;
	•	complete and archive finished work;
	•	retain all records reliably.
The strongest measure of success is:
The user spends less time managing their management tool.
CLCKD should disappear into the workflow while keeping the production organized.
