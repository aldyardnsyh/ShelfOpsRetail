import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { ErrorState } from "@/components/error-state";
import { Logo } from "@/components/logo";
import { getMe } from "@/lib/data";
import { getI18n } from "@/lib/i18n/server";

export default async function FullscreenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [me, { t }] = await Promise.all([getMe(), getI18n()]);

  if (!me.ok) {
    if (me.error.status === 401) {
      const pathname = (await headers()).get("x-pathname") ?? "/dashboard";
      redirect("/login?expired=1&next=" + encodeURIComponent(pathname));
    }
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-5 px-4 py-10">
        <Logo />
        <ErrorState error={me.error} />
      </div>
    );
  }

  return <div className="min-h-screen bg-background text-foreground">{children}</div>;
}
