export interface KpiItem {
  label: string;
  value: string;
  hint?: string;
  tone?: "normal" | "success" | "warning" | "danger";
}

const TONE_CLASS: Record<NonNullable<KpiItem["tone"]>, string> = {
  normal: "text-foreground",
  success: "text-success-strong",
  warning: "text-warning-strong",
  danger: "text-danger-strong",
};

/**
 * Baris kartu KPI bersama (2-6 sel). Menggantikan pola <dl> manual yang
 * sebelumnya diduplikasi di 8 halaman dengan 3 dialek berbeda.
 */
export function KpiStrip({ items }: { items: KpiItem[] }) {
  const cols =
    items.length >= 6
      ? "lg:grid-cols-6"
      : items.length === 5
        ? "lg:grid-cols-5"
        : items.length === 4
          ? "lg:grid-cols-4"
          : items.length === 3
            ? "sm:grid-cols-2 lg:grid-cols-3"
            : "sm:grid-cols-2";

  return (
    <dl
      className={`grid overflow-hidden rounded-lg border border-border bg-background sm:grid-cols-2 ${cols}`}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="border-b border-border p-5 sm:border-r sm:last:border-r-0 lg:border-b-0"
        >
          <dt className="text-xs font-medium text-muted-foreground">
            {item.label}
          </dt>
          <dd
            className={`tabular mt-2 text-xl font-semibold ${
              TONE_CLASS[item.tone ?? "normal"]
            }`}
          >
            {item.value}
          </dd>
          {item.hint ? (
            <p className="mt-1 text-[11px] text-muted-foreground">{item.hint}</p>
          ) : null}
        </div>
      ))}
    </dl>
  );
}
