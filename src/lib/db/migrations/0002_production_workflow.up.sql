-- Additive production workflow. Existing project/output records are preserved.
CREATE TABLE production_project (
  project_id TEXT NOT NULL PRIMARY KEY REFERENCES project(id) ON DELETE RESTRICT,
  production_type TEXT NOT NULL DEFAULT 'film' CHECK (production_type IN ('film', 'photography', 'event', 'custom')),
  approver_name TEXT,
  scope_revision INTEGER NOT NULL DEFAULT 1 CHECK (scope_revision >= 1),
  scope_confirmed_at TEXT,
  shoot_completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE output_spec (
  deliverable_id TEXT NOT NULL PRIMARY KEY REFERENCES deliverable(id) ON DELETE RESTRICT,
  format TEXT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 999),
  revision_allowance INTEGER NOT NULL DEFAULT 2 CHECK (revision_allowance BETWEEN 0 AND 20),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE output_version (
  deliverable_id TEXT NOT NULL REFERENCES deliverable(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  title TEXT NOT NULL,
  link TEXT,
  change_note TEXT,
  feedback TEXT,
  review_status TEXT NOT NULL CHECK (review_status IN ('not_submitted', 'awaiting_review', 'in_review', 'approved', 'changes_requested')),
  submitted_at TEXT,
  approved_at TEXT,
  approved_by TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (deliverable_id, revision),
  CHECK (delivered_at IS NULL OR review_status = 'approved')
);

CREATE TABLE production_event (
  id TEXT NOT NULL PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE RESTRICT,
  deliverable_id TEXT REFERENCES deliverable(id) ON DELETE RESTRICT,
  revision INTEGER,
  kind TEXT NOT NULL,
  attributed_to TEXT,
  details TEXT,
  source TEXT NOT NULL DEFAULT 'local_operator' CHECK (source = 'local_operator'),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_production_event_project ON production_event (project_id, created_at, id);

CREATE TRIGGER trg_output_version_content_immutable
BEFORE UPDATE OF title, link, change_note ON output_version
WHEN (OLD.submitted_at IS NOT NULL OR OLD.review_status <> 'not_submitted')
  AND (NEW.title IS NOT OLD.title OR NEW.link IS NOT OLD.link OR NEW.change_note IS NOT OLD.change_note)
BEGIN
  SELECT RAISE(ABORT, 'Submitted version content is immutable; create a new revision');
END;
CREATE TRIGGER trg_production_event_no_update
BEFORE UPDATE ON production_event
BEGIN
  SELECT RAISE(ABORT, 'Production events are append-only');
END;
CREATE TRIGGER trg_production_event_no_delete
BEFORE DELETE ON production_event
BEGIN
  SELECT RAISE(ABORT, 'Production events are append-only');
END;

INSERT INTO production_project (project_id, created_at, updated_at)
  SELECT id, created_at, updated_at FROM project;
INSERT INTO output_spec (deliverable_id, created_at, updated_at)
  SELECT id, created_at, updated_at FROM deliverable;
INSERT INTO output_version (deliverable_id, revision, title, link, review_status, created_at, updated_at)
  SELECT id, revision, title, link, review_status, created_at, updated_at FROM deliverable;
-- Imported approvals retain their stored status, but are not falsely attributed
-- to a client and do not fabricate approval/delivery timestamps or events.
