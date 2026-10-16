ALTER TABLE production_payment_milestone ADD COLUMN work_gate TEXT NOT NULL DEFAULT 'none'
  CHECK (work_gate IN ('none', 'production', 'post_production', 'delivery'));
