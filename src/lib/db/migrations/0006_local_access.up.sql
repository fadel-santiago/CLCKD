-- Local access pilot only. No paid entitlement or verified identity is fabricated.
CREATE TABLE owner_account (
  id INTEGER NOT NULL PRIMARY KEY CHECK (id = 1),
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  access_mode TEXT NOT NULL DEFAULT 'local_owner' CHECK (access_mode = 'local_owner'),
  created_at TEXT NOT NULL
);
CREATE TABLE access_invitation (
  id TEXT NOT NULL PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES project(id) ON DELETE RESTRICT,
  recipient_name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  share_payments INTEGER NOT NULL CHECK (share_payments IN (0, 1)),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  claimed_at TEXT,
  revoked_at TEXT
);
CREATE TABLE invitation_output (
  invitation_id TEXT NOT NULL REFERENCES access_invitation(id) ON DELETE RESTRICT,
  deliverable_id TEXT NOT NULL REFERENCES deliverable(id) ON DELETE RESTRICT,
  PRIMARY KEY (invitation_id, deliverable_id)
);
CREATE TABLE access_session (
  token_hash TEXT NOT NULL PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('owner', 'project_viewer')),
  invitation_id TEXT REFERENCES access_invitation(id) ON DELETE RESTRICT,
  project_id TEXT REFERENCES project(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  CHECK ((role = 'owner' AND invitation_id IS NULL AND project_id IS NULL) OR
    (role = 'project_viewer' AND invitation_id IS NOT NULL AND project_id IS NOT NULL))
);
CREATE TABLE access_attempt (
  bucket TEXT NOT NULL PRIMARY KEY,
  attempts INTEGER NOT NULL,
  resets_at TEXT NOT NULL
);
