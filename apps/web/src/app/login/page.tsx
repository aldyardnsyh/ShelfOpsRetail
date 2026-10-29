import type { Kpis } from "@shelfops/api-client";
import type { Metadata } from "next";
import Link from "next/link";

import kpisFixture from "../../../fixtures/kpis.json";
import { DemoBanner } from "@/components/demo-banner";
import { LoginForm } from "@/components/login-form";
import { LocaleToggle } from "@/components/locale-toggle";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { DEMO_MODE } from "@/lib/demo";
import { formatNumber, formatPercent } from "@/lib/format";
import { getI18n } from "@/lib/i18n/server";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = {
  title: "Masuk",
};

const kpis = kpisFixture as unknown as Kpis;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string; next?: string }>;
}) {
  const { t, locale } = await getI18n();
  const params = await searchParams;
  const sessionExpired = params.expired === "1";
  const nextPath = safeNext(params.next);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Logo />
          <div className="flex items-center gap-2">
            <LocaleToggle />
            <Link
              href="/"
              className="rounded text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {t.auth.backHome}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8 lg:py-14">
        {DEMO_MODE ? <DemoBanner className="mb-6" /> : null}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,440px)_1fr] lg:gap-16">
          <div className="w-full max-w-[440px]">
            <LoginForm
              demoMode={DEMO_MODE}
              sessionExpired={sessionExpired}
              next={nextPath}
            />
          </div>

          <aside className="hidden lg:block">
            <div className="rounded-lg border border-border bg-surface-subtle p-6">
              <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
                <div>
                  <p className="text-xs font-medium text-foreground">
                    {t.auth.sampleTitle}
                  </p>
                </div>
                <Badge variant="outline">{t.common.dataDemo}</Badge>
              </div>
              <div className="mt-4 overflow-hidden rounded-md border border-border bg-background">
                <img
                  src="/illustrations/login-modules-v3.svg"
                  alt={t.landing.loginIllustrationAlt}
                  className="aspect-[16/9] w-full object-cover"
                  width={960}
                  height={540}
                />
              </div>
              <dl className="mt-4 grid grid-cols-3 divide-x divide-border border-y border-border py-3">
                <div className="px-2">
                  <dt className="text-[11px] text-muted-foreground">
                    {t.auth.sampleScore}
                  </dt>
                  <dd className="tabular mt-1 text-base font-semibold text-foreground">
                    {formatPercent(kpis.avg_compliance, locale)}
                  </dd>
                </div>
                <div className="px-2">
                  <dt className="text-[11px] text-muted-foreground">
                    {t.auth.sampleOos}
                  </dt>
                  <dd className="tabular mt-1 text-base font-semibold text-foreground">
                    {formatPercent(kpis.oos_rate, locale)}
                  </dd>
                </div>
                <div className="px-2">
                  <dt className="text-[11px] text-muted-foreground">
                    {t.auth.samplePrice}
                  </dt>
                  <dd className="tabular mt-1 text-base font-semibold text-foreground">
                    {formatPercent(kpis.price_mismatch_rate, locale)}
                  </dd>
                </div>
              </dl>
              <div className="mt-4 space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {t.auth.sampleStore}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatNumber(kpis.stores_count, locale)} {t.dashboard.storesActive}
                </p>
              </div>
              <ul className="mt-4 space-y-1.5 border-t border-border pt-4">
                {t.auth.sampleModules.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

