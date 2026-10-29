-- 000007_gateway_extras — status eksplisit untuk alur upload & chat gateway.
--
-- documents.status: 'uploaded' menandai berkas sudah tersimpan di ObjectStore
-- tetapi belum diambil worker kb_ingest.
-- messages.status: memungkinkan placeholder assistant 'pending' saat ai-rag
-- belum tersedia (degradasi), tanpa mengarang jawaban.

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_status_check;
ALTER TABLE documents ADD CONSTRAINT documents_status_check
  CHECK (status IN ('uploaded','queued','parsing','chunking','embedding','ready','failed'));

ALTER TABLE messages ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'done';
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_status_check;
ALTER TABLE messages ADD CONSTRAINT messages_status_check
  CHECK (status IN ('pending','streaming','done','error'));
