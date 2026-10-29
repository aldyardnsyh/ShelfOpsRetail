import type { Citation, ToolCall } from "@shelfops/api-client";

import type { Locale } from "@/lib/i18n";

export interface DemoReply {
  text: string;
  citations: Citation[];
  toolCalls: ToolCall[];
  refused: boolean;
}

const oosCitation: Citation = {
  ordinal: 1,
  document_id: "0199d000-0000-7000-8000-000000000004",
  document_title: "SOP Penanganan Out of Stock",
  chunk_id: "0199d100-0000-7000-8000-000000000001",
  page: 4,
  heading_path: "2. Langkah penanganan > 2.3 Eskalasi",
  score: 0.91,
  snippet:
    "Jika satu baris kehilangan dua facing atau lebih, auditor wajib membuat alert OOS dan menghubungi penanggung jawab toko pada hari yang sama.",
};

const checklistCitation: Citation = {
  ordinal: 2,
  document_id: "0199d000-0000-7000-8000-000000000003",
  document_title: "Checklist Audit Harian",
  chunk_id: "0199d100-0000-7000-8000-000000000002",
  page: 1,
  heading_path: "Pemeriksaan pagi",
  score: 0.84,
  snippet:
    "Periksa minimal tiga foto per sesi. Pastikan label harga terbaca dan foto tidak buram sebelum dikirim.",
};

const promoCitation: Citation = {
  ordinal: 1,
  document_id: "0199d000-0000-7000-8000-000000000001",
  document_title: "SOP Display Promo Q4",
  chunk_id: "0199d100-0000-7000-8000-000000000003",
  page: 7,
  heading_path: "Syarat display promo",
  score: 0.79,
  snippet:
    "Display promo Q4 memakai header berwarna biru, minimal dua facing per SKU, dan label harga promo yang terlihat dari lorong.",
};

const priceCitation: Citation = {
  ordinal: 1,
  document_id: "0199d000-0000-7000-8000-000000000002",
  document_title: "Panduan Harga Rak Minuman",
  chunk_id: "0199d100-0000-7000-8000-000000000004",
  page: 12,
  heading_path: "Referensi harga rak minuman",
  score: 0.81,
  snippet:
    "Selisih harga dihitung terhadap harga referensi planogram. Toleransi default 0 rupiah dan dapat diubah per planogram.",
};

const complianceToolCall: ToolCall = {
  id: "0199f100-0000-7000-8000-000000000098",
  name: "get_store_audit_summary",
  args: { city: "Bekasi", period_days: 14 },
  result_summary:
    "2 toko di Bekasi. OOS rate 9,4% vs rata-rata jaringan 4,1%. Kekosongan terbesar: Air Mineral dan Teh Kemasan di baris 1.",
  duration_ms: 212,
  status: "done",
  requires_confirmation: false,
};

const comparisonToolCall: ToolCall = {
  id: "0199f100-0000-7000-8000-000000000099",
  name: "get_store_ranking",
  args: { regions: ["Jawa Timur", "Jawa Barat"], period_days: 30 },
  result_summary:
    "4 toko dibandingkan. Selisih OOS rate 0,8 poin persentase.",
  duration_ms: 168,
  status: "done",
  requires_confirmation: false,
};

export function getDemoReply(prompt: string, locale: Locale): DemoReply {
  const text = prompt.toLowerCase();

  if (text.includes("promo")) {
    return {
      text:
        locale === "en"
          ? "The Q4 promo display uses a blue header, at least two facings per SKU, and promo price labels visible from the aisle. [1]"
          : "Display promo Q4 memakai header berwarna biru, minimal dua facing per SKU, dan label harga promo yang terlihat dari lorong. [1]",
      citations: [promoCitation],
      toolCalls: [],
      refused: false,
    };
  }

  if (text.includes("harga") || text.includes("price")) {
    return {
      text:
        locale === "en"
          ? "A price mismatch is counted against the planogram reference price. The default tolerance is 0 rupiah and can be changed per planogram. [1]"
          : "Selisih harga dihitung terhadap harga referensi planogram. Toleransi default 0 rupiah dan dapat diubah per planogram. [1]",
      citations: [priceCitation],
      toolCalls: [],
      refused: false,
    };
  }

  if (text.includes("bekasi") || text.includes("compliance") || text.includes("kepatuhan")) {
    return {
      text:
        locale === "en"
          ? "The largest drop came from two stores in Bekasi. Both have an OOS rate above the network average, mainly on row 1. The most consistent cause in the audit data is an empty slot for bottled water and packaged tea after the morning delivery. Check stock for those two SKUs, then re-audit after the shelf is refilled. [1][2]"
          : "Penurunan terbesar berasal dari dua toko di Bekasi. Keduanya punya OOS rate di atas rata-rata jaringan, terutama pada baris 1. Penyebab yang paling konsisten dari data audit adalah kekosongan Air Mineral dan Teh Kemasan setelah pengiriman pagi. Cek stok untuk dua SKU tersebut, lalu audit ulang setelah rak diisi. [1][2]",
      citations: [oosCitation, checklistCitation],
      toolCalls: [complianceToolCall],
      refused: false,
    };
  }

  if (
    text.includes("surabaya") ||
    text.includes("bandung") ||
    text.includes("oos") ||
    text.includes("stok")
  ) {
    return {
      text:
        locale === "en"
          ? "Over the last 30 days, stores in Surabaya had a slightly higher average OOS rate than Bandung, with a gap of 0.8 percentage points. Two Surabaya stores account for most of the empty facings on row 1, so prioritise bottled water stock checks there."
          : "Dalam 30 hari terakhir, rata-rata OOS rate toko di Surabaya sedikit lebih tinggi daripada Bandung, dengan selisih 0,8 poin persentase. Dua toko Surabaya menyumbang sebagian besar facing kosong pada baris 1, jadi prioritaskan pengecekan stok Air Mineral di sana.",
      citations: [],
      toolCalls: [comparisonToolCall],
      refused: false,
    };
  }

  if (text.includes("sop") || text.includes("audit")) {
    return {
      text:
        locale === "en"
          ? "The daily audit starts by checking at least three photos per session, making sure they are not blurry, and confirming price labels are readable. Then check any row missing two or more facings and create an OOS alert on the same day. [1][2]"
          : "Audit harian dimulai dengan memeriksa minimal tiga foto per sesi, memastikan foto tidak buram, dan memastikan label harga terbaca. Setelah itu, periksa baris yang kehilangan dua facing atau lebih dan buat alert OOS pada hari yang sama. [1][2]",
      citations: [checklistCitation, oosCitation],
      toolCalls: [],
      refused: false,
    };
  }

  return {
    text:
      locale === "en"
        ? "I could not find a source for that question in this workspace. Upload a document that covers the topic, or ask about audit data, OOS, price mismatches, or the Q4 promo SOP."
        : "Saya tidak menemukan sumber untuk pertanyaan itu di workspace ini. Unggah dokumen yang membahas topik tersebut, atau tanyakan soal data audit, OOS, selisih harga, atau SOP promo Q4.",
    citations: [],
    toolCalls: [],
    refused: true,
  };
}
