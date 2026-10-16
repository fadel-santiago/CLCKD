-- Maintenance only; authentication data is retained rather than erased.
ALTER TABLE invitation_output RENAME TO invitation_output_access_archive;
ALTER TABLE access_session RENAME TO access_session_archive;
ALTER TABLE access_invitation RENAME TO access_invitation_archive;
ALTER TABLE access_attempt RENAME TO access_attempt_archive;
ALTER TABLE owner_account RENAME TO owner_account_archive;
