import type { NextConfig } from "next";

/**
 * Dua profil deploy dari commit yang sama:
 *
 * - production: `NEXT_PUBLIC_DEMO_MODE` kosong + `NEXT_PUBLIC_API_URL` wajib.
 * - demo: `NEXT_PUBLIC_DEMO_MODE=1`, tanpa backend, data dari `fixtures/`.
 *
 * Build gagal cepat bila profil production tidak lengkap, supaya deployment
 * tidak pernah tiba-tiba menyajikan data contoh tanpa disadari.
 */
function assertDeployProfile(): void {
  const demo =
    process.env.NEXT_PUBLIC_DEMO_MODE === "1" ||
    process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  if (demo) return;

  // Same-origin (Docker satu domain) adalah profil yang sah: browser memakai
  // path relatif dan Caddy mem-proxy /api/* ke gateway.
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  const sameOrigin = apiUrl === "" || apiUrl === undefined
    ? process.env.NEXT_PUBLIC_API_SAME_ORIGIN === "1"
    : apiUrl === "/";

  if (process.env.NODE_ENV === "production" && !apiUrl && !sameOrigin) {
    throw new Error(
      "Set NEXT_PUBLIC_API_URL (mis. https://api.domain) atau " +
        "NEXT_PUBLIC_API_SAME_ORIGIN=1 untuk deployment satu domain. " +
        "Set NEXT_PUBLIC_DEMO_MODE=1 bila memang ingin build demo statis.",
    );
  }
}

assertDeployProfile();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  // Image produksi mandiri: `node server.js` tanpa node_modules penuh.
  output: "standalone",
  async redirects() {
    return [
      { source: "/sessions", destination: "/shelf", permanent: true },
      { source: "/sessions/new", destination: "/shelf/new", permanent: true },
      { source: "/sessions/:id", destination: "/shelf/:id", permanent: true },
    ];
  },
};

export default nextConfig;