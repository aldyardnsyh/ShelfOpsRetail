/**
 * Satu-satunya sumber kebenaran untuk profil runtime web.
 *
 * Ada dua profil deployment, keduanya dari commit yang sama:
 *
 *  - **production** (default): `NEXT_PUBLIC_DEMO_MODE` tidak diset. Semua data
 *    diambil dari gateway nyata; login, RBAC, dan cookie sesi aktif penuh.
 *  - **demo**: `NEXT_PUBLIC_DEMO_MODE=1`. Tidak ada backend, tidak ada
 *    autentikasi, dan semua halaman membaca fixture di `apps/web/fixtures`
 *    yang bentuknya identik dengan respons gateway. Aman untuk preview publik
 *    karena tidak ada kredensial maupun data pelanggan yang terlibat.
 *
 * Flag ini sengaja *build-time* (prefix `NEXT_PUBLIC_`): nilainya di-inline saat
 * build sehingga bundel demo dan bundel production tidak bercampur, dan fixture
 * halaman aplikasi hanya dimuat lewat dynamic import ketika profil demo aktif.
 * Mock pemasaran di landing/login tetap statis karena memang ilustrasi berlabel
 * "data demo", bukan pembacaan data.
 */

const rawDemoFlag = process.env.NEXT_PUBLIC_DEMO_MODE;
const rawApiUrl = process.env.NEXT_PUBLIC_API_URL;

export const DEMO_MODE = rawDemoFlag === "1" || rawDemoFlag === "true";

/**
 * URL gateway untuk profil production. Diabaikan saat mode demo.
 *
 * Nilai kosong (atau "/") berarti **same-origin**: browser memanggil
 * `/api/v1/...` pada host yang sama dengan web, lalu Caddy meneruskan ke
 * gateway. Ini profil default untuk deployment Docker satu domain, dan membuat
 * cookie sesi `SameSite=Lax` tetap terkirim tanpa CORS.
 */
export const API_BASE_URL = (rawApiUrl ?? "").replace(/\/+$/, "");

/**
 * Validasi profil dilakukan sekali saat build di `next.config.ts`
 * (lihat `assertDeployProfile`), bukan di modul ini, agar tidak ada kode mati
 * yang ikut ke bundel klien.
 */

/** Label yang ditampilkan di UI agar pengunjung tahu ini data contoh. */
export const DEMO_LABEL = "Mode demo — data contoh, bukan data pelanggan";