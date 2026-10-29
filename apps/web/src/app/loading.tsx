import { Logo } from "@/components/logo";

export default function RootLoading() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-4 px-4 py-10">
      <Logo />
      <div className="space-y-2" role="status" aria-live="polite">
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        <div className="h-7 w-full max-w-sm animate-pulse rounded bg-muted" />
        <div className="h-4 w-full max-w-md animate-pulse rounded bg-muted" />
      </div>
      <span className="text-xs text-muted-foreground">Menyiapkan halaman</span>
    </div>
  );
}
