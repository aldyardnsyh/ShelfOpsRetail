import { DemoButton } from "@/components/demo-button";
import { Camera } from "@/components/icons";
import { HeroMock } from "@/components/landing/hero-mock";
import { MockAlerts } from "@/components/landing/mock-alerts";
import { MockCamera } from "@/components/landing/mock-camera";
import { MockCopilot } from "@/components/landing/mock-copilot";
import { MockZones } from "@/components/landing/mock-zones";
import { Reveal } from "@/components/landing/reveal";
import { LocaleToggle } from "@/components/locale-toggle";
import { LandingMobileMenu } from "@/components/landing-mobile-menu";
import { Logo } from "@/components/logo";
import { getI18n } from "@/lib/i18n/server";

// CTA tinta: satu pilihan warna seragam dengan tema kertas-tinta; teks putih.
const CTA_CLASS =
  "min-h-[48px] rounded-xl bg-zinc-900 px-7 text-base font-semibold text-white hover:bg-zinc-800 focus-visible:ring-zinc-900";

// Headline display XL: clamp 48-76px, tracking -0.03em (di .landing-display).
const HERO_TYPE = "landing-display font-semibold leading-[1.05] text-[clamp(48px,7vw,76px)]";

// Lead fitur: "Melalui fitur <X>," dengan nama fitur di-highlight (render <strong> dari i18n yang berisi tag <strong>).
function FeatureLead({ text }: { text: string }) {
  const parts = text.split(/(<strong>.*?<\/strong>)/);
  return (
    <p className="mt-5 text-base font-medium text-foreground">
      {parts.map((part, i) =>
        part.startsWith("<strong>") ? (
          <strong key={i} className="font-semibold text-foreground underline decoration-zinc-300 decoration-2 underline-offset-4">
            {part.replace(/<\/?strong>/g, "")}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

export default async function LandingPage() {
  const { t } = await getI18n();

  const navItems = [
    { href: "#cara-kerja", label: t.landing.navProduct },
    { href: "#kamera", label: t.landing.navCamera },
    { href: "#copilot", label: t.landing.navCopilot },
  ];

  const ledgerRows = [
    { pain: t.landing.pain1, solve: t.landing.solve1 },
    { pain: t.landing.pain2, solve: t.landing.solve2 },
    { pain: t.landing.pain3, solve: t.landing.solve3 },
    { pain: t.landing.pain4, solve: t.landing.solve4 },
  ];

  const personas = [
    { title: t.landing.persona1Title, before: t.landing.persona1Before, after: t.landing.persona1After },
    { title: t.landing.persona2Title, before: t.landing.persona2Before, after: t.landing.persona2After },
    { title: t.landing.persona3Title, before: t.landing.persona3Before, after: t.landing.persona3After },
  ];

  return (
    <div className="landing min-h-screen bg-background text-foreground">
      {/* Kanopi: logo + anchor + LocaleToggle + CTA */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Logo />
          <nav className="hidden items-center gap-6 md:flex" aria-label="Navigasi utama">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="min-h-[44px] py-4 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <LandingMobileMenu label={t.landing.menu} items={navItems}>
            <LocaleToggle />
            <a href="/login" className="text-sm text-muted-foreground hover:text-foreground">
              {t.landing.signIn}
            </a>
          </LandingMobileMenu>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="hidden sm:flex">
              <LocaleToggle />
            </div>
            <a
              href="/login"
              className="hidden min-h-[44px] items-center rounded px-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 sm:inline-flex"
            >
              {t.landing.signIn}
            </a>
            <DemoButton
              label={t.landing.demoCta}
              pendingLabel={t.landing.demoPending}
              size="sm"
              className="rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 focus-visible:ring-zinc-900"
            />
          </div>
        </div>
      </header>

      <main>
        {/* 1. Hero: headline solusi + CTA + mock dashboard hidup */}
        <section id="demo" className="mx-auto w-full max-w-[1200px] px-4 pt-14 pb-16 sm:px-6 lg:px-8 lg:pt-24 lg:pb-24">
          <Reveal className="mx-auto max-w-4xl text-center">
            <h1 className={`${HERO_TYPE} text-balance`}>{t.landing.heroTitle}</h1>
            <p className="mx-auto mt-6 max-w-[58ch] text-lg leading-8 text-muted-foreground">
              {t.landing.heroSub}
            </p>
            <div className="mt-9 flex justify-center">
              <DemoButton
                label={t.landing.demoCta}
                pendingLabel={t.landing.demoPending}
                size="lg"
                className={CTA_CLASS}
              />
            </div>
          </Reveal>
          <Reveal delay={140} className="mx-auto mt-14 max-w-3xl lg:mt-16">
            <HeroMock
              labels={{
                live: t.landing.monitor.live,
                demo: t.landing.sampleCaption,
                footfall: t.monitor.footfall,
                visitorsNow: t.monitor.visitorsNow,
                emptyFacings: t.monitor.emptyFacings,
                camerasOnline: t.monitor.camerasOnline,
                zone: t.monitor.zonesTitle,
                people: t.monitor.footfallShort,
                share: t.monitor.share,
              }}
            />
          </Reveal>
        </section>

        {/* 2. Ledger nyeri: malam sebelum vs pagi dengan ShelfOps */}
        <section id="cara-kerja" className="mx-auto w-full max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <Reveal className="max-w-2xl">
            <h2 className="landing-display text-3xl font-semibold text-foreground sm:text-4xl">
              {t.landing.ledgerTitle}
            </h2>
          </Reveal>
          <Reveal delay={100} className="mt-10">
            <div className="grid border-t border-border md:grid-cols-2">
              <div className="hidden py-3 text-xs font-medium text-muted-foreground md:block">
                {t.landing.ledgerBefore}
              </div>
              <div className="hidden border-l border-border py-3 pl-6 text-xs font-medium text-foreground md:block">
                {t.landing.ledgerAfter}
              </div>
              {ledgerRows.map((row, index) => (
                <div key={index} className="md:contents">
                  <div className="landing-ledger-row py-4 pr-6">
                    <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground md:hidden">
                      {t.landing.ledgerBefore}
                    </span>
                    <p className="text-sm leading-6 text-muted-foreground">{row.pain}</p>
                  </div>
                  <div className="landing-ledger-row border-t border-border py-4 md:border-l md:border-t-0 md:pl-6 md:pr-6">
                    <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground md:hidden">
                      {t.landing.ledgerAfter}
                    </span>
                    <p className="text-sm leading-6 text-foreground">{row.solve}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        {/* 3. Fitur utama: kamera jadi mata (kamera dulu, foto kemudian) */}
        <section id="kamera" className="mx-auto w-full max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <Reveal>
              <span className="inline-flex size-11 items-center justify-center rounded-xl bg-surface-subtle text-primary">
                <Camera className="size-5" aria-hidden="true" />
              </span>
              <h2 className="landing-display mt-5 text-3xl font-semibold text-foreground sm:text-4xl">
                {t.landing.cameraFeatureTitle}
              </h2>
              <FeatureLead text={t.landing.cameraFeatureLead} />
              <p className="mt-5 max-w-[55ch] text-base leading-7 text-muted-foreground">
                {t.landing.cameraFeatureBody}
              </p>
            </Reveal>
            <Reveal delay={120}>
              <MockCamera
                labels={{
                  live: t.monitorWall.live,
                  offline: t.monitorWall.offline,
                  fps: t.monitorWall.fps,
                }}
              />
            </Reveal>
          </div>
        </section>

        {/* 4. Fitur: Peringatan menjadi tugas */}
        <section id="peringatan" className="mx-auto w-full max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <Reveal>
              <h2 className="landing-display text-3xl font-semibold text-foreground sm:text-4xl">
                {t.landing.feature1Title}
              </h2>
              <FeatureLead text={t.landing.alertFeatureLead} />
              <p className="mt-5 max-w-[55ch] text-base leading-7 text-muted-foreground">
                {t.landing.feature1Body}
              </p>
            </Reveal>
            <Reveal delay={120}>
              <MockAlerts resolveLabel={t.tasks.finish} />
            </Reveal>
          </div>
        </section>

        {/* 5. Fitur: Pengunjung dan zona (selang-seling) */}
        <section id="pengunjung" className="mx-auto w-full max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <Reveal className="order-2 lg:order-1">
              <MockZones dwellLabel={t.monitor.dwell} />
            </Reveal>
            <Reveal delay={120} className="order-1 lg:order-2">
              <h2 className="landing-display text-3xl font-semibold text-foreground sm:text-4xl">
                {t.landing.feature2Title}
              </h2>
              <FeatureLead text={t.landing.zoneFeatureLead} />
              <p className="mt-5 max-w-[55ch] text-base leading-7 text-muted-foreground">
                {t.landing.feature2Body}
              </p>
            </Reveal>
          </div>
        </section>

        {/* 6. Fitur: Copilot dengan sitasi */}
        <section id="copilot" className="mx-auto w-full max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <Reveal>
              <h2 className="landing-display text-3xl font-semibold text-foreground sm:text-4xl">
                {t.landing.feature3Title}
              </h2>
              <FeatureLead text={t.landing.copilotFeatureLead} />
              <p className="mt-5 max-w-[55ch] text-base leading-7 text-muted-foreground">
                {t.landing.feature3Body}
              </p>
            </Reveal>
            <Reveal delay={120}>
              <MockCopilot
                question={t.landing.copilotQuestion}
                answer={t.landing.copilotAnswer}
                sourceLabel={t.copilot.sources}
                citation={t.landing.copilotCitation}
                confidence={t.landing.copilotConfidence}
              />
            </Reveal>
          </div>
        </section>

        {/* 7. Persona: situasi dan apa yang ShelfOps kerjakan */}
        <section id="persona" className="mx-auto w-full max-w-[1200px] px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <Reveal className="max-w-2xl">
            <h2 className="landing-display text-3xl font-semibold text-foreground sm:text-4xl">
              {t.landing.personaTitle}
            </h2>
            <p className="mt-3 text-xs text-muted-foreground">{t.landing.personaNote}</p>
          </Reveal>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {personas.map((persona, index) => (
              <Reveal key={persona.title} delay={index * 100}>
                <article className="h-full rounded-2xl border border-border bg-background p-6">
                  <h3 className="landing-display text-lg font-semibold text-foreground">
                    {persona.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {persona.before}
                  </p>
                  <p className="mt-4 border-t border-border pt-4 text-sm leading-6 text-foreground">
                    {persona.after}
                  </p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        {/* 8. CTA penutup */}
        <section id="mulai" className="mx-auto w-full max-w-[1200px] px-4 pt-8 pb-16 sm:px-6 lg:px-8 lg:pt-12 lg:pb-24">
          <Reveal className="rounded-2xl border border-border bg-surface-subtle px-6 py-14 text-center sm:px-12 lg:py-20">
            <h2 className="landing-display mx-auto max-w-3xl text-balance text-4xl font-semibold leading-[1.08] text-foreground sm:text-5xl">
              {t.landing.closingTitle}
            </h2>
            <p className="mx-auto mt-5 max-w-[52ch] text-base leading-7 text-muted-foreground">
              {t.landing.closingSub}
            </p>
            <div className="mt-9 flex justify-center">
              <DemoButton
                label={t.landing.finalCta}
                pendingLabel={t.landing.demoPending}
                size="lg"
                className={CTA_CLASS}
              />
            </div>
          </Reveal>
        </section>
      </main>

      {/* Footer: identitas, copyright, dan pilihan bahasa */}
      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-4 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Logo compact />
            <span className="text-xs text-muted-foreground">{t.landing.footerNote}</span>
          </div>
          <p className="text-xs text-muted-foreground">{t.landing.footerCopyright}</p>
          <LocaleToggle />
        </div>
      </footer>
    </div>
  );
}
