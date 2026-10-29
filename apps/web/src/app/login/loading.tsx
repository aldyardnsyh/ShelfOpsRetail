import { Logo } from "@/components/logo";

export default function LoginLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center px-4 sm:px-6 lg:px-8">
        <Logo />
      </div>
      <div className="mx-auto grid w-full max-w-[1200px] gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,440px)_1fr] lg:gap-16 lg:px-8 lg:py-14">
        <div className="space-y-4">
          <div className="h-8 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
          <div className="h-9 w-full animate-pulse rounded bg-muted" />
          <div className="h-9 w-full animate-pulse rounded bg-muted" />
        </div>
        <div className="hidden rounded-lg border border-border bg-surface-subtle p-6 lg:block">
          <div className="aspect-[16/9] w-full animate-pulse rounded-md bg-muted" />
          <div className="mt-4 h-4 w-1/2 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}
