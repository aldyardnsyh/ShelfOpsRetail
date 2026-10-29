import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import { I18nProvider } from "@/lib/i18n/client";
import { getI18n } from "@/lib/i18n/server";
import { ToastProvider } from "@/components/ui/toast";

import "./globals.css";
import "./landing.css";

// Display face landing "Vitrin Malam" — signage retail modern.
const BricolageDisplay = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "ShelfOpsRetail",
    template: "%s | ShelfOpsRetail",
  },
  description:
    "Platform operasi toko all-in-one: CCTV dan computer vision, inventori, harga, pengadaan, tugas, laporan, integrasi, serta copilot AI yang menjawab dengan sitasi.",
  applicationName: "ShelfOpsRetail",
  icons: {
    icon: "/icon.svg",
  },
  openGraph: {
    type: "website",
    siteName: "ShelfOpsRetail",
    title: "ShelfOpsRetail | Platform operasi toko all-in-one",
    description:
      "CCTV, computer vision, inventori, harga, pengadaan, tugas, laporan, dan copilot AI dalam satu alur operasional.",
    locale: "id_ID",
  },
  twitter: {
    card: "summary_large_image",
    title: "ShelfOpsRetail | Platform operasi toko all-in-one",
    description:
      "CCTV, computer vision, inventori, harga, pengadaan, tugas, laporan, dan copilot AI dalam satu alur operasional.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { locale } = await getI18n();

  return (
    <html
      lang={locale}
      className={`${GeistSans.variable} ${GeistMono.variable} ${BricolageDisplay.variable}`}
    >
      <body>
        <I18nProvider locale={locale}>
          <ToastProvider>{children}</ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}



