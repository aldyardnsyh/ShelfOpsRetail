-- 000011_document_index_seed — isi indeks dokumen (versi + chunk) untuk
-- 8 dokumen seed dari 000010. Idempotent: id diturunkan dari md5 sehingga
-- pengulangan tidak menggandakan baris.
--
-- Catatan: embedding sengaja NULL. Embedding dihitung oleh layanan RAG
-- (provider hash/openai), bukan oleh migrasi SQL.

INSERT INTO document_versions (
  id, workspace_id, document_id, version, checksum, storage_key,
  size_bytes, status, created_at
)
SELECT md5(d.id::text || ':ver:' || d.current_version::text)::uuid,
       d.workspace_id,
       d.id,
       d.current_version,
       md5(d.id::text || ':sha:' || d.current_version::text),
       'seed/documents/' || d.id::text || '.pdf',
       d.size_bytes,
       'active',
       d.created_at
FROM documents d
WHERE d.deleted_at IS NULL
ON CONFLICT (document_id, version) DO NOTHING;

WITH doc_topics (document_id, details) AS (
  VALUES
    ('162e5e8c-c68e-5a48-2192-c73e6eb3530b'::uuid, ARRAY[
      'Checklist inspeksi mingguan memeriksa kebersihan rak, kelengkapan label harga, dan kesesuaian facing terhadap planogram aktif. Inspeksi dijadwalkan setiap Senin pagi sebelum jam operasional.',
      'Setiap lorong dinilai pada lima titik: rak atas, rak mata, rak bawah, ujung gondola, dan display promo. Nilai 1 diberikan bila seluruh facing terisi, 0 bila ada kekosongan lebih dari dua posisi.',
      'Temuan inspeksi wajib disertai satu foto per lorong dan dikirim ke antrean tugas dengan tenggat 1x24 jam. Temuan yang tidak ditindaklanjuti dalam tenggat naik menjadi peringatan tinggi.',
      'Checklist ditutup oleh kepala toko dengan tanda tangan digital. Rekap mingguan dipakai sebagai dasar penilaian kinerja tim rak dan bahan pembinaan vendor.',
      'Bukti audit disimpan minimal 90 hari. Setiap perubahan status temuan tercatat di audit log beserta pengguna, waktu, dan alasannya.'
    ]),
    ('7ae5a3b8-ab44-90ba-b3c6-3c7c721f959f'::uuid, ARRAY[
      'Daftar harga referensi Q4 memuat harga jual yang berlaku untuk seluruh toko pada kuartal berjalan. Harga referensi menjadi pembanding tunggal saat memeriksa label di rak.',
      'Perubahan harga harus disetujui kategori manager lalu diterbitkan paling lambat H-2 sebelum periode berlaku. Harga lama tetap dipakai sampai tanggal efektif baru tercatat di sistem.',
      'Selisih antara label rak dan harga referensi dikategorikan menjadi tiga tingkat: selisih di bawah 2 persen, antara 2 sampai 5 persen, dan di atas 5 persen. Dua tingkat terakhir wajib diperbaiki hari yang sama.',
      'Produk promo memakai harga khusus yang hanya aktif selama periode promo. Setelah promo berakhir, label wajib dikembalikan ke harga normal pada penutupan toko hari itu.',
      'Daftar harga diekspor setiap Senin untuk kebutuhan rekonsiliasi dengan sistem kasir. Ekspor menyertakan versi daftar agar jejak perubahan dapat ditelusuri.',
      'Harga yang tidak lagi dipakai ditandai tidak aktif, bukan dihapus, supaya riwayat transaksi lama tetap dapat direkonstruksi saat audit.'
    ]),
    ('dba0d941-fed3-bfe7-ddeb-7bf218ab1fd3'::uuid, ARRAY[
      'Panduan Copilot menjelaskan cara mengajukan pertanyaan operasional dan membaca jawaban bersitasi. Copilot hanya menjawab berdasarkan data toko yang boleh diakses pengguna.',
      'Setiap jawaban wajib menyertakan rujukan ke dokumen sumber atau baris data toko. Bila rujukan tidak tersedia, Copilot menolak menjawab dan menyarankan eskalasi ke manusia.',
      'Pertanyaan yang menyentuh data pribadi pengunjung dibatasi pada agregat. Copilot tidak menampilkan identitas individu, hanya jumlah dan durasi kunjungan.'
    ]),
    ('de831b4b-dbec-ab93-cdfd-eb101d3efb3b'::uuid, ARRAY[
      'Panduan kolom PO menjelaskan arti setiap kolom pada dokumen purchase order yang dikirim ke supplier, termasuk satuan, harga satuan, dan syarat pembayaran.',
      'Kolom kuantitas memakai satuan terkecil yang disepakati. Konversi dari karton ke pcs harus dicantumkan pada kolom keterangan agar penerimaan barang tidak salah hitung.',
      'Tanggal kirim pada PO adalah tanggal barang tiba di gudang toko, bukan tanggal pengiriman dari gudang supplier. Selisih lebih dari satu hari wajib dikonfirmasi ke supplier.',
      'PO yang sudah dikirim tidak boleh diubah isinya. Perubahan dilakukan dengan menerbitkan PO revisi bernomor urut dan menautkannya ke PO asal.',
      'Barang yang diterima diperiksa terhadap PO pada saat serah terima. Selisih kuantitas dicatat sebagai temuan penerimaan dan diselesaikan sebelum faktur diproses.'
    ]),
    ('0b4756cb-b920-a8f6-f05e-6ddcd50b289b'::uuid, ARRAY[
      'Pedoman restock minuman dingin mengatur urutan pengisian chiller: minuman cepat laku lebih dekat ke pintu, minuman premium pada rak mata, dan stok cadangan di rak bawah.',
      'Suhu chiller dijaga antara 2 sampai 4 derajat Celsius dan dicatat dua kali sehari. Penyimpangan suhu lebih dari 30 menit wajib dilaporkan ke tim fasilitas.',
      'Restock dilakukan pagi sebelum toko dibuka dan sore setelah jam sibuk. Pengisian ulang saat jam sibuk hanya untuk produk yang benar-benar kosong.',
      'Rotasi FIFO diterapkan setiap pengisian: produk dengan tanggal kedaluwarsa terdekat dipindahkan ke baris depan. Produk yang mendekati kedaluwarsa diberi penanda khusus.',
      'Facing kosong dicatat per lorong. Kekosongan lebih dari dua posisi memicu permintaan restock ke gudang dan masuk ke antrean tugas tim rak.'
    ]),
    ('8587ebc9-48b1-6be1-1fc2-c6871eaf363d'::uuid, ARRAY[
      'Playbook selisih harga menjelaskan langkah ketika label rak berbeda dari harga referensi, mulai dari verifikasi bukti foto sampai koreksi label.',
      'Langkah pertama adalah memastikan selisih bukan akibat salah baca. Petugas membandingkan foto label, harga referensi aktif, dan harga di sistem kasir sebelum menyimpulkan temuan.',
      'Selisih di atas 5 persen wajib diperbaiki hari yang sama dan dilaporkan ke kategori manager. Selisih yang berulang pada produk yang sama dalam sebulan masuk daftar pengawasan.',
      'Setiap koreksi label meninggalkan jejak: foto sebelum, foto sesudah, waktu koreksi, dan nama petugas. Jejak ini dipakai saat evaluasi kinerja bulanan.'
    ]),
    ('24c7a153-be11-947a-7cac-6be7221a4f43'::uuid, ARRAY[
      'Prosedur label harga baru mengatur pembuatan, pencetakan, dan pemasangan label untuk produk yang baru masuk daftar harga referensi.',
      'Label dicetak dari sistem, bukan ditulis tangan. Setiap label memuat nama produk, harga, satuan, dan kode batang yang sesuai dengan master produk.',
      'Label dipasang pada rel harga di depan produk, bukan menempel pada kemasan. Label lama dicabut bersamaan agar tidak ada dua harga terbaca pada satu posisi.'
    ]),
    ('cabcf898-23b3-77a8-e036-b70c2e50c0c6'::uuid, ARRAY[
      'SOP pengecekan rak harian mengatur urutan pemeriksaan rak dari lorong masuk hingga kasir, dengan fokus pada ketersediaan dan kerapian facing.',
      'Pengecekan dilakukan dua kali: sebelum toko dibuka untuk memastikan rak terisi, dan satu jam sebelum tutup untuk menangkap kekosongan akibat penjualan hari itu.',
      'Facing dirapikan sejajar dengan tepi depan rak. Produk yang terjatuh atau rusak dipisahkan ke keranjang retur dan dicatat sebagai penyusutan.',
      'Hasil pengecekan dicatat per lorong beserta jumlah facing kosong. Catatan ini menjadi masukan untuk perencanaan restock esok hari.'
    ])
)
INSERT INTO chunks (
  id, workspace_id, document_id, version, ordinal,
  content, heading_path, page, token_count, lang
)
SELECT md5(dt.document_id::text || ':chunk:' || g.ord::text)::uuid,
       d.workspace_id,
       d.id,
       d.current_version,
       g.ord,
       c.content,
       (ARRAY[
         'Ringkasan',
         'Langkah Operasional',
         'Kontrol Kualitas',
         'Pengecualian & Eskalasi',
         'Bukti & Audit'
       ])[1 + ((g.ord - 1) % 5)],
       1 + ((g.ord * 3) % 6),
       GREATEST(24, (length(c.content) / 4))::int,
       'indonesian'::regconfig
FROM doc_topics dt
JOIN documents d ON d.id = dt.document_id
CROSS JOIN LATERAL generate_series(1, d.chunk_count) AS g(ord)
CROSS JOIN LATERAL (
  SELECT dt.details[1 + ((g.ord - 1) % array_length(dt.details, 1))] AS content
) c
ON CONFLICT (document_id, version, ordinal) DO NOTHING;

UPDATE documents d
SET last_indexed_at = now() - (interval '1 hour' * (1 + (abs(hashtext(d.id::text)) % 20))),
    chunk_count = (SELECT count(*) FROM chunks c WHERE c.document_id = d.id)
WHERE d.deleted_at IS NULL
  AND d.chunk_count <> (SELECT count(*) FROM chunks c WHERE c.document_id = d.id);
