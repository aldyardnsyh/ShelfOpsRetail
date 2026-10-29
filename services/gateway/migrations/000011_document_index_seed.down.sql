-- 000011_document_index_seed (down) — hapus indeks dokumen seed.
DELETE FROM chunks
WHERE document_id IN (
  SELECT id FROM documents
  WHERE title IN (
    'Checklist Inspeksi Mingguan',
    'Daftar Harga Referensi Q4',
    'Panduan Copilot ShelfOps',
    'Panduan Kolom PO',
    'Pedoman Restock Minuman Dingin',
    'Playbook Selisih Harga',
    'Prosedur Label Harga Baru',
    'SOP Pengecekan Rak Harian'
  )
);

DELETE FROM document_versions
WHERE document_id IN (
  SELECT id FROM documents
  WHERE title IN (
    'Checklist Inspeksi Mingguan',
    'Daftar Harga Referensi Q4',
    'Panduan Copilot ShelfOps',
    'Panduan Kolom PO',
    'Pedoman Restock Minuman Dingin',
    'Playbook Selisih Harga',
    'Prosedur Label Harga Baru',
    'SOP Pengecekan Rak Harian'
  )
);

UPDATE documents SET last_indexed_at = NULL WHERE last_indexed_at IS NOT NULL;
