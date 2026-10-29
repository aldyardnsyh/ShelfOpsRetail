-- 000014_demo_history_completion (down)

DELETE FROM visitor_events
WHERE id IN (
  SELECT md5('ve-hist-' || st.id::text || '-' || d.day_offset || '-' || g)::uuid
  FROM stores st
  CROSS JOIN generate_series(1, 13) AS d(day_offset)
  CROSS JOIN LATERAL generate_series(1, 340) AS g
  WHERE st.workspace_id = '00000000-0000-7000-8000-000000000001'::uuid
);

UPDATE tasks
SET checklist = '[]'::jsonb
WHERE workspace_id = '00000000-0000-7000-8000-000000000001'::uuid
  AND checklist = jsonb_build_array(
      jsonb_build_object('text', 'Cek kondisi rak dan catat temuan', 'done', false),
      jsonb_build_object('text', 'Tindak lanjuti sesuai SOP toko', 'done', false),
      jsonb_build_object('text', 'Unggah bukti foto setelah selesai', 'done', false)
    );