# ShelfOps Illustration Spec (flat illustration)

Kontrak visual untuk semua ilustrasi di `apps/web/public/illustrations/`.
Setiap SVG baru wajib lulus checklist ini sebelum dipakai.

## 1. Kanvas & grid
- viewBox `0 0 960 540`, `width="960" height="540"`, `role="img"`, `aria-label` spesifik.
- Margin aman 48px dari tepi kanvas. Konten tidak menyentuh tepi.
- Semua koordinat bilangan bulat atau .5 (crisp, tanpa blur).

## 2. Warna (token design system, flat tanpa gradien)
| Peran | Hex | Pakai untuk |
| --- | --- | --- |
| ink | `#18181B` | judul, teks utama, ikon stroke |
| muted | `#71717A` | teks sekunder |
| faint | `#A1A1AA` | garis bantu, panah, connector |
| border | `#E4E4E7` | stroke panel/kartu |
| fill | `#F4F4F5` | isian kartu, bar netral |
| fill-soft | `#FAFAFA` | latar panel |
| blue | `#2563EB` | aksen: elemen aktif, highlight, indikator |
| blue-soft | `#EFF6FF` | latar kartu aksen |
| green | `#059669` | status selesai/berhasil |
| green-soft | `#D1FAE5` | latar status berhasil |
| amber | `#B45309` | status perhatian |
| amber-soft | `#FFFBEB` | latar status perhatian |
| white | `#FFFFFF` | latar kanvas & kartu |

- Palet tertutup: tidak ada warna lain. Maksimal 1 aksen biru per kanvas kecuali struktur
  (mis. timeline) memakai biru sebagai warna jalur.
- `amber` hanya untuk label perhatian, `green` hanya untuk selesai.

## 3. Bentuk
- Radius: kanvas 12, panel 10, kartu 8, chip/ikon 6, titik r=3-6.
- Tidak ada shadow, glow, filter, gradien, opacity di bawah 1 pada bentuk.
- Overlap antar panel dilarang; jarak antar panel minimal 24px.

## 4. Stroke
- Stroke panel: 1. Stroke ikon: 1.6. Stroke penekanan (bbox, jalur aktif): 2.
- Semua stroke `stroke-linecap="round"` dan `stroke-linejoin="round"`.
- Dashed hanya `stroke-dasharray="4 3"` (satu pola untuk seluruh aset).

## 5. Ikon (gaya konsisten)
- Digambar dalam kotak 24x24, dipasang pada tile 28x28 radius 6 fill `#F4F4F5` stroke border.
- Gaya: outline 1.6, bentuk geometris sederhana, tanpa detail kecil < 2px.

## 6. Panah & connector
- Hanya dua jenis:
  - garis lurus + kepala segitiga solid `M x y l 8 4 l -8 4 z` fill `#A1A1AA`.
  - garis siku (orthogonal) 90° dengan radius tikungan 0.
- Panah horizontal sejajar sumbu teks; jarak kepala panah dari target 8px.
- Dilarang panah lengkung, panah diagonal bebas, kepala panah ganda.

## 7. Teks
- Font: `ui-sans-serif` (class .font-base) untuk label; `ui-monospace` (.font-mono) untuk angka/kode.
- Ukuran: judul 19/600, subjudul 12.5, label panel 12/600, body 11.5, caption 10.5, mono 10-10.5.
- Fill teks: ink / muted / faint. Warna lain hanya di chip label status.
- Semua teks `aria-hidden` tidak diperlukan; teks adalah bagian dari aria-label pengganti.

## 8. Komposisi
- Header: judul kiri atas di (48, 40), subjudul di (48, 60).
- Satu fokus per ilustrasi; elemen pendukung lebih kecil dan tenang.
- Footer/catatan: strip `#FAFAFA` radius 10 di bawah, teks caption 10.5 `#71717A`.

## 10. Motion (animasi dalam SVG)

Dua mode diizinkan:

### Mode A — ambience (maks 2 elemen)
Pulse/travel halus untuk kanvas yang ceritanya sudah selesai (login, hero).
Durasi loop 3-6 detik, easing `ease-in-out`, opacity min 0.55.

### Mode B — story loop (berceritanya seperti GIF)
Ilustrasi fitur memainkan **satu siklus cerita 8-14 detik** yang berulang:
langkah muncul berurutan (fade-in 0.4s per langkah), satu elemen aktif
ter-highlight, jeda 1.5-2 detik di akhir siklus, lalu kembali ke awal dan
mengulang. Aturan:
- Semua langkah berbagi satu durasi siklus yang sama (`--cycle`), di-drive oleh
  keyframes persen, BUKAN delay per elemen. Ini menjamin sinkron sempurna.
- Urutan = urutan baca (kiri ke kanan / atas ke bawah).
- Maksimal 1 elemen "aktif" per langkah; highlight = stroke/teks blue, bukan glow.
- Semua keyframes persen harus dibangun dari skala waktu yang sama; dilarang
  menggabungkan `animation-delay` berbeda-beda pada elemen sekuens.
- Statistik angka boleh "menghitung" naik via steps() maks 8 step.
- Wajib `@media (prefers-reduced-motion: reduce)`: seluruh sekuens mati dan
  SEMUA langkah tampil (opacity 1) — gambar statis harus lengkap.
- Cerita statis tetap utuh tanpa animasi.

Umum:
- Animasi = CSS `<style>` di dalam SVG, tanpa JS/library.
- Wajib blok reduced-motion dengan `!important`.
- Dilarang blink cepat, bounce, spin; opacity min 0.55.

## 9. Checklist QA (wajib lulus semua)
- [ ] Semua warna termasuk palet tertutup di atas
- [ ] Semua stroke 1 / 1.6 / 2, linecap+linejoin round
- [ ] Tidak ada gradien/blur/filter/shadow/opacity<1
- [ ] Radius sesuai hierarki (12/10/8/6)
- [ ] Panah hanya 2 jenis yang diizinkan, kepala segitiga 8x8
- [ ] Dashed hanya `4 3`
- [ ] Tidak ada elemen keluar margin 48px atau overlap antar panel
- [ ] Teks >= 10px, kontras: muted #71717A di #FFFFFF/#FAFAFA/F4F4F5 lolos AA untuk teks kecil
- [ ] aria-label mendeskripsikan isi, bukan "ilustrasi"
- [ ] Cerita visual jelas tanpa membaca teks (silhouette test)
