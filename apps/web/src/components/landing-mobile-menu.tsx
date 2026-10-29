"use client";

import { useRef } from "react";

interface MobileMenuItem {
  href: string;
  label: string;
}

// Menu mobile landing: <details> dengan anchor yang menutup menu setelah
// diklik (tanpa state — cukup removeAttribute("open")).
export function LandingMobileMenu({
  label,
  items,
  children,
}: {
  label: string;
  items: MobileMenuItem[];
  children?: React.ReactNode;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const closeMenu = () => detailsRef.current?.removeAttribute("open");

  return (
    <details ref={detailsRef} className="relative md:hidden">
      <summary className="flex h-9 cursor-pointer list-none items-center rounded-md border border-border px-3 text-sm text-foreground [&::-webkit-details-marker]:hidden">
        {label}
      </summary>
      <div className="absolute right-0 z-40 mt-1 w-56 rounded-md border border-border bg-background p-1 shadow-sm">
        {items.map((item) => (
          <a
            key={item.href}
            href={item.href}
            onClick={closeMenu}
            className="block rounded px-3 py-2 text-sm text-muted-foreground hover:bg-surface-subtle hover:text-foreground"
          >
            {item.label}
          </a>
        ))}
        <div className="flex items-center justify-between gap-2 rounded px-3 py-2">{children}</div>
      </div>
    </details>
  );
}
