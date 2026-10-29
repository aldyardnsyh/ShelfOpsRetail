import Link from "next/link";

import { ShelfMark } from "@/components/icons";
import { cn } from "@/lib/utils";

export function Logo({
  href = "/",
  compact = false,
  className,
}: {
  href?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
        className,
      )}
      aria-label="ShelfOpsRetail"
    >
      <span className="flex size-7 items-center justify-center rounded-md bg-foreground text-background">
        <ShelfMark className="size-4" />
      </span>
      {compact ? null : (
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          ShelfOpsRetail
        </span>
      )}
    </Link>
  );
}
