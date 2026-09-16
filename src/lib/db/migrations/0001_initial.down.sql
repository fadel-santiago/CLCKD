-- 0001_initial (final): reverse of the up migration.
-- Order: triggers, indexes, then tables child-first.
-- kv_meta is owned by bootstrap and is the migration ledger; it is
-- preserved by this rollback and neither dropped nor altered.

DROP TRIGGER trg_project_quote_status_update;
DROP TRIGGER trg_quote_project_non_lead_update;
DROP TRIGGER trg_quote_project_non_lead_insert;
DROP TRIGGER trg_project_client_active_update;
DROP TRIGGER trg_project_client_active_insert;

DROP INDEX ux_invoice_project_reference;
DROP INDEX ux_shoot_equipment_item_shoot_item_sort;
DROP INDEX idx_client_name_country_nocase;

DROP TABLE quote;
DROP TABLE invoice;
DROP TABLE deliverable;
DROP TABLE task;
DROP TABLE shoot_equipment_item;
DROP TABLE shoot;
DROP TABLE project;
DROP TABLE client;
