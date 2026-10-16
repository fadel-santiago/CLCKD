# Real application captures

Captured on 16 October 2026 from the existing CLCKD application, using the
previously verified clean-install copy, Node 22.23.3 and a localhost-only production
server. No application code or styles were changed for the captures.

All clients, contacts, projects, dates, amounts and review links are fictional.
Records were prepared through the existing repositories in a fresh temporary
SQLite database, then inspected in the rendered browser UI. No demonstration
records, database, session tokens or setup credentials are included here.
The live business database was not opened or captured.

Desktop viewport: 1440 × 1000. Mobile viewport: 390 × 844, with document width
confirmed at 390 pixels (no horizontal overflow on the project slate).
Full-page captures extend below those viewport heights; image widths exclude
the browser scrollbar. Browser chrome is excluded. Screenshots were converted
from the browser's JPEG capture to compressed PNG without layout alterations,
overlays, redactions or fabricated UI. Each image is below 900 KB.

| File | Visible evidence |
| --- | --- |
| [01-dashboard.png](01-dashboard.png) | Current production, upcoming shoot, review queue and overdue work. |
| [02-clients.png](02-clients.png) | Three fictional clients with contact details and linked project counts. |
| [03-projects.png](03-projects.png) | Booked, post-production and completed project states. |
| [04-project-workspace.png](04-project-workspace.png) | Confirmed scope, approver, output specifications and workspace navigation. |
| [05-production-workflow.png](05-production-workflow.png) | Shoot date, local call time, timezone, location and crew notes. |
| [06-review-delivery.png](06-review-delivery.png) | Social edits v2 awaiting review, with v1 feedback retained. Delivery evidence is in image 10. |
| [07-finances.png](07-finances.png) | Fictional €12,000 agreement, 30/30/40 schedule, two recorded external receipts. |
| [08-mobile.png](08-mobile.png) | Responsive project slate, full page. |
| [09-task-management.png](09-task-management.png) | In-progress task, deadline and task status controls. |
| [10-delivery-record.png](10-delivery-record.png) | Approved brand-film version with external handover recorded; project remains open for other outputs. |
| [11-client-preview.png](11-client-preview.png) | Owner's read-only client-experience preview, checkpoints and payment schedule. |

## What these images do not verify

- Review links use reserved `example.com` addresses. No actual film playback,
  media-host access or private-video protection was demonstrated.
- Approvals and payments are operator-entered fictional records, not client
  identity verification, bank confirmation, signatures or transactions.
- Image 11 is the owner's preview tab, not an authenticated guest-session test.
- Image 07 demonstrates payment milestones, not invoice editing or automatic
  reconciliation. Quotes/invoices remain separate existing project records.
- These are visual walkthroughs, not an exhaustive browser regression suite.
  The 222-test baseline in the main README comes from clean-install verification.

The temporary demonstration server was stopped after capture. A new installation
starts without these records; no demo-seeding code is part of the repository.
