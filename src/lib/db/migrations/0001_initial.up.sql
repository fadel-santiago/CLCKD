-- 0001_initial (final): client, project, shoot, shoot_equipment_item, task,
-- deliverable, invoice, quote.
-- Conforms to docs/data-model.md §§1.1–1.4 and §7.
-- kv_meta is owned by bootstrap and preserved by rollback; this migration
-- neither creates nor alters it.
-- Deliberate: no IF NOT EXISTS (fail closed), no ON UPDATE clauses,
-- no seed data, no SQLite overdue trigger (service-layer only).

CREATE TABLE client (
  id TEXT NOT NULL PRIMARY KEY, -- ULID
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'organization' CHECK (kind IN ('person', 'organization')),
  preferred_contact_name TEXT,
  email TEXT,
  phone TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  region TEXT,
  postal_code TEXT,
  country TEXT,
  notes TEXT,
  created_at TEXT NOT NULL, -- RFC-3339 UTC
  updated_at TEXT NOT NULL, -- RFC-3339 UTC
  archived_at TEXT -- RFC-3339 UTC; NULL = active
);

CREATE TABLE project (
  id TEXT NOT NULL PRIMARY KEY, -- ULID
  client_id TEXT NOT NULL REFERENCES client(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'lead' CHECK (status IN ('lead', 'proposed', 'booked', 'in_production', 'post_production', 'completed', 'on_hold')),
  start_date TEXT, -- YYYY-MM-DD
  end_date TEXT, -- YYYY-MM-DD
  location TEXT,
  budget_minor_units INTEGER,
  budget_currency TEXT,
  notes TEXT,
  created_at TEXT NOT NULL, -- RFC-3339 UTC
  updated_at TEXT NOT NULL, -- RFC-3339 UTC
  archived_at TEXT, -- RFC-3339 UTC; NULL = active
  CHECK ((start_date IS NULL OR end_date IS NULL OR end_date >= start_date)),
  CHECK (
    (budget_minor_units IS NULL AND budget_currency IS NULL)
    OR
    (budget_minor_units IS NOT NULL AND budget_currency IS NOT NULL)
  ),
  CHECK (budget_minor_units IS NULL OR budget_minor_units >= 0)
);

CREATE TABLE shoot (
  id TEXT NOT NULL PRIMARY KEY, -- ULID
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE RESTRICT,
  shoot_date TEXT NOT NULL, -- YYYY-MM-DD
  call_time_local TEXT, -- HH:MM, local to location_tz
  location_tz TEXT NOT NULL, -- IANA timezone
  location TEXT NOT NULL,
  crew_notes TEXT,
  created_at TEXT NOT NULL, -- RFC-3339 UTC
  updated_at TEXT NOT NULL, -- RFC-3339 UTC
  archived_at TEXT -- RFC-3339 UTC; NULL = active
);

CREATE TABLE shoot_equipment_item (
  id TEXT NOT NULL PRIMARY KEY, -- ULID
  shoot_id TEXT NOT NULL REFERENCES shoot(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  checked INTEGER NOT NULL DEFAULT 0 CHECK (checked IN (0, 1)),
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, -- RFC-3339 UTC
  updated_at TEXT NOT NULL -- RFC-3339 UTC
);

CREATE TABLE task (
  id TEXT NOT NULL PRIMARY KEY, -- ULID
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  due_date TEXT, -- YYYY-MM-DD
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'blocked', 'done')),
  created_at TEXT NOT NULL, -- RFC-3339 UTC
  updated_at TEXT NOT NULL, -- RFC-3339 UTC
  archived_at TEXT -- RFC-3339 UTC; NULL = active
);

CREATE TABLE deliverable (
  id TEXT NOT NULL PRIMARY KEY, -- ULID
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('edit_master', 'color_grade', 'rough_cut', 'final_master', 'thumbnail', 'stills', 'audio_master', 'social_cutdown', 'other')),
  title TEXT NOT NULL,
  due_date TEXT, -- YYYY-MM-DD
  review_status TEXT NOT NULL DEFAULT 'not_submitted' CHECK (review_status IN ('not_submitted', 'awaiting_review', 'in_review', 'approved', 'changes_requested')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  link TEXT,
  notes TEXT,
  created_at TEXT NOT NULL, -- RFC-3339 UTC
  updated_at TEXT NOT NULL, -- RFC-3339 UTC
  archived_at TEXT -- RFC-3339 UTC; NULL = active
);

CREATE TABLE invoice (
  id TEXT NOT NULL PRIMARY KEY, -- ULID
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE RESTRICT,
  reference TEXT NOT NULL,
  amount_minor_units INTEGER NOT NULL CHECK (amount_minor_units > 0),
  currency TEXT NOT NULL,
  invoice_status TEXT NOT NULL DEFAULT 'draft' CHECK (invoice_status IN ('draft', 'sent', 'paid', 'void')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid', 'overdue')),
  payment_due_date TEXT, -- YYYY-MM-DD
  date_issued TEXT, -- YYYY-MM-DD
  notes TEXT,
  created_at TEXT NOT NULL, -- RFC-3339 UTC
  updated_at TEXT NOT NULL, -- RFC-3339 UTC
  archived_at TEXT, -- RFC-3339 UTC; NULL = active
  CHECK (invoice_status <> 'paid' OR payment_status = 'paid'),
  CHECK (payment_status <> 'paid' OR invoice_status = 'paid'),
  CHECK (invoice_status <> 'void' OR payment_status IN ('unpaid', 'partial')),
  CHECK (payment_status <> 'overdue' OR invoice_status = 'sent')
);

CREATE TABLE quote (
  project_id TEXT NOT NULL PRIMARY KEY REFERENCES project(id) ON DELETE RESTRICT, -- ULID; PK is project_id (1:1 with project)
  amount_minor_units INTEGER NOT NULL CHECK (amount_minor_units > 0),
  currency TEXT NOT NULL,
  valid_until TEXT, -- YYYY-MM-DD
  notes TEXT,
  created_at TEXT NOT NULL, -- RFC-3339 UTC
  updated_at TEXT NOT NULL -- RFC-3339 UTC
);

CREATE INDEX idx_client_name_country_nocase ON client (name COLLATE NOCASE, country);

CREATE UNIQUE INDEX ux_shoot_equipment_item_shoot_item_sort
  ON shoot_equipment_item (shoot_id, item, sort);

CREATE UNIQUE INDEX ux_invoice_project_reference
  ON invoice (project_id, reference);

CREATE TRIGGER trg_project_client_active_insert
BEFORE INSERT ON project
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM client WHERE id = NEW.client_id AND archived_at IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'project.client_id must reference an active client');
END;

CREATE TRIGGER trg_project_client_active_update
BEFORE UPDATE OF client_id ON project
FOR EACH ROW
WHEN NOT EXISTS (SELECT 1 FROM client WHERE id = NEW.client_id AND archived_at IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'project.client_id must reference an active client');
END;

CREATE TRIGGER trg_quote_project_non_lead_insert
BEFORE INSERT ON quote
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM project WHERE id = NEW.project_id AND status = 'lead')
BEGIN
  SELECT RAISE(ABORT, 'quote requires a non-lead project');
END;

CREATE TRIGGER trg_quote_project_non_lead_update
BEFORE UPDATE OF project_id ON quote
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM project WHERE id = NEW.project_id AND status = 'lead')
BEGIN
  SELECT RAISE(ABORT, 'quote requires a non-lead project');
END;

CREATE TRIGGER trg_project_quote_status_update
BEFORE UPDATE OF status ON project
FOR EACH ROW
WHEN NEW.status = 'lead' AND EXISTS (SELECT 1 FROM quote WHERE project_id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'project with a quote cannot have lead status');
END;
