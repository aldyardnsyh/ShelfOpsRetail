import Link from "next/link";

import { ChevronRight } from "@/components/icons";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { getI18n } from "@/lib/i18n/server";

export default async function NotFound() {
  const { t } = await getI18n();

  const modules = [
    { href: "/dashboard", label: t.nav.overview, body: t.monitor.subtitle },
    { href: "/visitors", label: t.nav.visitors, body: t.monitor.visitorsBody },
    { href: "/cameras", label: t.nav.cameras, body: t.monitor.camerasBody },
    { href: "/shelf", label: t.nav.shelf, body: t.sessions.shelfSubtitle },
    { href: "/alerts", label: t.nav.alerts, body: t.alerts.subtitle },
    { href: "/docs", label: t.lab.docs, body: t.docs.subtitle },
  ];

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-6 px-4 py-10">
      <Logo />
      <div className="space-y-2">
        <p className="font-mono text-xs text-muted-foreground">404</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {t.states.notFoundTitle}
        </h1>
        <p className="text-sm text-muted-foreground">{t.states.notFoundBody}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/dashboard">{t.states.backDashboard}</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/">{t.auth.backHome}</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/docs">{t.states.docsLink}</Link>
        </Button>
      </div>

      <section className="space-y-2 border-t border-border pt-5">
        <h2 className="text-sm font-medium text-foreground">
          {t.states.notFoundPopularTitle}
        </h2>
        <p className="text-xs text-muted-foreground">{t.states.notFoundPopularBody}</p>
        <ul className="mt-2 divide-y divide-border overflow-hidden rounded-lg border border-border">
          {modules.map((module) => (
            <li key={module.href}>
              <Link
                href={module.href}
                className="group flex items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">
                    {module.label}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {module.body}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs text-muted-foreground">{t.states.notFoundHint}</p>
    </div>
  );
}
