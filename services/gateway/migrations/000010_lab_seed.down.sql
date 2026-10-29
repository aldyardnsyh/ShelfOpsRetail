-- 000010_lab_seed (down) — hapus data lab; tabel audit/chat/eval/analisis
-- tetap ada (milik 000001), hanya isian seed yang dibuang.
DELETE FROM price_tags WHERE id::text LIKE 'pt-%';
DELETE FROM detections WHERE id::text LIKE 'det-%';
DELETE FROM audit_images WHERE id::text LIKE 'img-%';
DELETE FROM eval_results WHERE id::text LIKE 'ers-%';
DELETE FROM eval_runs WHERE id::text LIKE 'er-%';
DELETE FROM eval_cases WHERE id::text LIKE 'ec-%';
DELETE FROM eval_datasets WHERE id::text LIKE 'ed-%';
DELETE FROM llm_traces WHERE id::text LIKE 'trc-%';
DELETE FROM tool_calls WHERE id::text LIKE 'tool-%';
DELETE FROM message_citations WHERE id::text LIKE 'cit-%';
DELETE FROM messages WHERE id::text LIKE 'msg-%';
DELETE FROM conversations WHERE id::text LIKE 'conv-%';
DELETE FROM documents WHERE id::text LIKE 'doc-%';
DELETE FROM model_registry WHERE id::text LIKE 'mr-%';
DELETE FROM benchmark_runs WHERE id::text LIKE 'bm-%';
