-- Agreement tracking only: CLCKD never collects or moves project funds.
CREATE TABLE production_payment_plan (
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE RESTRICT,
  total_minor_units INTEGER NOT NULL CHECK (total_minor_units > 0 AND total_minor_units <= 1000000000000000),
  currency TEXT NOT NULL,
  contract_reference TEXT,
  terms TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, revision)
);
CREATE TABLE production_payment_milestone (
  id TEXT NOT NULL PRIMARY KEY,
  project_id TEXT NOT NULL,
  plan_revision INTEGER NOT NULL,
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 19),
  title TEXT NOT NULL,
  basis_points INTEGER NOT NULL CHECK (basis_points BETWEEN 1 AND 10000),
  amount_minor_units INTEGER NOT NULL CHECK (amount_minor_units > 0),
  payment_condition TEXT NOT NULL,
  due_date TEXT,
  paid_at TEXT,
  payment_reference TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id, plan_revision) REFERENCES production_payment_plan(project_id, revision) ON DELETE RESTRICT,
  UNIQUE (project_id, plan_revision, position),
  CHECK ((paid_at IS NULL AND payment_reference IS NULL) OR (paid_at IS NOT NULL AND payment_reference IS NOT NULL))
);
