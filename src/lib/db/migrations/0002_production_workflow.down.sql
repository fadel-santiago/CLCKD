-- Maintenance-only rollback; never exposed through normal app workflows.
DROP TRIGGER trg_production_event_no_delete;
DROP TRIGGER trg_production_event_no_update;
DROP TRIGGER trg_output_version_content_immutable;
DROP INDEX idx_production_event_project;
DROP TABLE production_event;
DROP TABLE output_version;
DROP TABLE output_spec;
DROP TABLE production_project;
