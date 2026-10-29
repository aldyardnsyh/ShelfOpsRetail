import type { Locale } from "@/lib/i18n";

function intlLocale(locale: Locale) {
  return locale === "en" ? "en-GB" : "id-ID";
}

export function formatNumber(
  value: number | null | undefined,
  locale: Locale,
  options?: Intl.NumberFormatOptions,
) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return new Intl.NumberFormat(intlLocale(locale), options).format(value);
}

export function formatPercent(
  value: number | null | undefined,
  locale: Locale,
  digits = 1,
) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return `${new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)}%`;
}

export function formatDelta(value: number | null | undefined, locale: Locale) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }
  const formatted = new Intl.NumberFormat(intlLocale(locale), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: "exceptZero",
  }).format(value);
  return `${formatted}%`;
}

export function formatDate(
  value: string | Date | null | undefined,
  locale: Locale,
  options?: Intl.DateTimeFormatOptions,
) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...options,
  }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined, locale: Locale) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Jam:menit:detik, untuk log kunjungan yang dibaca per kejadian. */
export function formatClock(
  value: string | Date | null | undefined,
  locale: Locale,
) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "-";
  // en-GB dipakai agar pemisah jam selalu titik dua (17:20:31), bukan titik
  // seperti locale id-ID.
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  }).format(date);
}

/** Tanggal ringkas + jam:menit:detik dalam satu baris. */
export function formatTimestamp(
  value: string | Date | null | undefined,
  locale: Locale,
) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "-";
  const day = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(date);
  return `${day}, ${formatClock(date, locale)}`;
}

export function formatDateTimeShort(
  value: string | Date | null | undefined,
  locale: Locale,
) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDateTimeMedium(
  value: string | Date | null | undefined,
  locale: Locale,
) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDwell(seconds: number) {
  const m = Math.floor(seconds / 60);
  const r = seconds % 60;
  return `${m}m ${r.toString().padStart(2, "0")}s`;
}

export function formatCurrency(value: number, locale: Locale) {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatBytes(bytes: number | null | undefined, locale: Locale) {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return "-";
  if (bytes < 1024) return `${formatNumber(bytes, locale)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${new Intl.NumberFormat(intlLocale(locale), {
      maximumFractionDigits: 0,
    }).format(kb)} KB`;
  }
  const mb = kb / 1024;
  return `${new Intl.NumberFormat(intlLocale(locale), {
    maximumFractionDigits: 1,
  }).format(mb)} MB`;
}

export function initials(name: string | null | undefined) {
  if (!name) return "SH";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function shortId(id: string | null | undefined, length = 8) {
  if (!id) return "-";
  return id.slice(0, length).toUpperCase();
}

export function titleCaseChannel(channel: string | null | undefined) {
  if (!channel) return "-";
  return channel.charAt(0).toUpperCase() + channel.slice(1);
}
