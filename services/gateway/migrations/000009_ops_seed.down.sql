-- 000009_ops_seed (down) — seed data eliminasi: tabel di-drop oleh 000008 down.
-- Hapus hanya data lab yang ditambahkan ke tabel lama:
DELETE FROM tasks WHERE source = 'agent' AND checklist <> '[]'::jsonb;
