# ShelfOps Illustration Spec v3 — Full-color, dimensional

Menggantikan v2 (flat monoline). Ilustrasi harus **berwarna penuh** (bukan outline
satu warna), dengan kesan kedalaman ringan (isometric-ish), dan **geometri panah
sempurna**.

## 1. Kanvas
- `viewBox="0 0 960 540"`, `width="960" height="540"`, `role="img"`, `aria-label` deskriptif.
- Margin aman 44px. Koordinat integer (crisp), hindari nilai desimal kecuali 0.5.

## 2. Palet berwarna penuh (wajib, jangan tambah warna lain)
Gunakan keluarga warna, bukan satu warna. Setiap area diisi warna, bukan hanya stroke.

| Kelompok | Hex | Pemakaian |
| --- | --- | --- |
| Biru utama | `#2563EB` `#3B82F6` `#60A5FA` | objek utama, kamera, produk |
| Biru muda | `#DBEAFE` `#EFF6FF` | latar panel, isian |
| Hijau | `#059669` `#10B981` `#D1FAE5` | status selesai, stok aman |
| Amber | `#D97706` `#F59E0B` `#FEF3C7` | peringatan, kekurangan |
| Merah | `#DC2626` `#FEE2E2` | rak kosong, gagal |
| Ungu | `#7C3AED` `#C4B5FD` `#EDE9FE` | laporan, analitik |
| Teal | `#0D9488` `#5EEAD4` | integrasi, data |
| Netral | `#18181B` `#3F3F46` `#71717A` `#A1A1AA` `#E4E4E7` `#F4F4F5` `#FAFAFA` `#FFFFFF` | teks, garis, latar |

Aturan warna:
- Setiap ilustrasi wajib memakai **minimal 4 keluarga warna** (bukan mono-biru).
- Isi bentuk dengan warna solid; outline hanya aksen tipis.
- Kedalaman: untuk tiap objek 3D-ish pakai 3 nada (atas terang, depan sedang, samping gelap).

## 3. Gaya dimensional (pseudo-3D isometric ringan)
- Objek digambar dengan sisi atas + sisi depan + sisi samping (parallelogram untuk sisi).
- Arah kedalaman konsisten: sumbu `x+` ke kanan-bawah 30°, `y+` ke kiri-bawah 30°.
- Sudut kemiringan sisi: `dx/dy = 0.5` (2:1 isometric). Contoh kotak 40 lebar x 24 depan:
  atas = `M x y l 20 -10 l 40 0 l -20 10 z`; depan = `M x y h40 v24 h-40 z`;
  samping = `M x+40 y l20 -10 v24 l-20 10 z`.
- Tidak ada gradient, shadow blur, atau glow. Kedalaman dari nada warna, bukan efek.
- Highlight: satu bidang lebih terang di sisi atas. Tidak ada stroke hitam tebal.

## 4. Geometri panah (WAJIB PRESISI — ini keluhan utama user)
Setiap panah didefinisikan sebagai SATU grup dengan urutan: batang, lalu kepala.

```
<g class="arrow">
  <path d="M {x1} {y} H {x2}" stroke="#3F3F46" stroke-width="2" stroke-linecap="round" fill="none"/>
  <path d="M {x2} {y-6} L {x2+10} {y} L {x2} {y+6} Z" fill="#3F3F46"/>
</g>
```
Aturan:
- Panah hanya **horizontal** atau **vertikal**. Dilarang belok/diagonal.
- Batang berakhir PERSIS di pangkal kepala (x2), kepala panjang 10, tinggi total 12.
- Ujung kepala (tip) berjarak **8px** dari tepi objek tujuan.
- Fill kepala = warna batang. Tidak boleh beda warna, tidak boleh ada sambungan bolong.
- Dilarang: panah lengkung, panah dengan tikungan 90°, garis putus, kepala panah ganda,
  batang yang berhenti sebelum pangkal kepala.

## 5. Konektor non-panah (garis penghubung)
- Siku 90° hanya jika tidak ada panah; sudut harus tepat.
- `stroke-width="2"`, `stroke-linecap="round"`, `stroke-linejoin="round"`.
- Garis harus bersambung penuh; dilarang ada segmen menggantung.

## 6. Teks
- `.font-base` = `ui-sans-serif, system-ui, "Segoe UI", sans-serif`; `.font-mono` = `ui-monospace, Menlo, monospace`.
- Ukuran minimum 10px. Judul 18-20/700, label 11-12/600, caption 10/400.
- Kontras AA: teks `#18181B`/`#3F3F46` di latar terang; teks putih hanya di latar `#2563EB`/`#059669`/`#DC2626`.

## 7. Label status berwarna
- Chip status = isian warna penuh + teks putih/kontras, radius 6, padding 8x4.
- Contoh: `#059669` + teks putih "selesai"; `#FEF3C7` + teks `#B45309` "menipis".

## 8. Motion
- Mode story-loop (siklus 12s) atau ambience (2 elemen).
- Semua keyframes persen pada skala siklus yang sama.
- `prefers-reduced-motion` hanya memperlambat 300%, TIDAK mematikan.

## 9. Checklist QA (semua wajib lulus)
- [ ] ≥4 keluarga warna dipakai, tidak ada ilustrasi mono
- [ ] Setiap objek punya minimal 2 nada (atas/front) untuk kesan dimensional
- [ ] Semua panah: horizontal/vertikal, batang menempel pangkal kepala, tip 8px dari target
- [ ] Tidak ada panah belok/putus/kepala ganda
- [ ] Tidak ada gradient/blur/filter/glow
- [ ] Teks ≥10px, kontras AA
- [ ] XML valid, viewBox 960x540, margin 44px
- [ ] Ketebalan stroke seragam 2 (garis) / 1.5 (outline objek)
