import type { Metadata } from "next";

import { ErrorState } from "@/components/error-state";
import { StartAudit } from "@/components/start-audit";
import { getDetectionResult, getStores } from "@/lib/data";
import { DEMO_MODE } from "@/lib/demo";
import { getI18n } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Mulai pemantauan",
};

export default async function NewShelfPage() {
  const { t } = await getI18n();
const stores = await getStores();
  const result = await getDetectionResult();

  if (!stores.ok) {
    return (
      <ErrorState
        error={stores.error}
        title={t.startAudit.loadErrorTitle}
        body={t.startAudit.loadErrorBody}
      />
    );
  }

  return (
    <StartAudit stores={stores.data} demoMode={DEMO_MODE} result={result} />
  );
}

