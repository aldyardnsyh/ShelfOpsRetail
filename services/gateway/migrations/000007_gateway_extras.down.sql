-- Rollback: dokumen 'uploaded' dikembalikan ke 'queued' agar CHECK lama valid.
UPDATE documents SET status = 'queued' WHERE status = 'uploaded';

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_status_check;
ALTER TABLE documents ADD CONSTRAINT documents_status_check
  CHECK (status IN ('queued','parsing','chunking','embedding','ready','failed'));

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_status_check;
ALTER TABLE messages DROP COLUMN IF EXISTS status;
