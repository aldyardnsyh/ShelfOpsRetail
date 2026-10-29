import type { Metadata } from "next";

import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { StoresTable } from "@/components/stores-table";
import { getRanking, getStores } from "@/lib/data";
import { getI18n } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Toko",
};

export default async function StoresPage() {
  const { t } = await getI18n();
  const [stores, ranking] = await Promise.all([getStores(), getRanking()]);

  const metrics = Object.fromEntries(
    (ranking.ok ? ranking.data : []).map((row) => [
      row.store_id,
      {
        audits: row.audits ?? 0,
        compliance: row.avg_compliance ?? 0,
        oos: row.oos_rate ?? 0,
      },
    ]),
  );

  return (
    <div className="space-y-6">
      <PageHeader title={t.stores.title} description={t.stores.subtitle} />
      {!stores.ok ? (
        <ErrorState error={stores.error} />
      ) : (
        <StoresTable stores={stores.data} metrics={metrics} />
      )}
    </div>
  );
}
