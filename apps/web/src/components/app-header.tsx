"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";

import { logoutAction } from "@/actions/auth";
import { Avatar } from "@/components/avatar";
import {
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  Settings,
} from "@/components/icons";
import { LocaleToggle } from "@/components/locale-toggle";
import { SidebarContent } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/lib/i18n/client";
import type { AppRole } from "@/lib/types";

const ROUTE_LABELS = [
  { route: "/dashboard" },
  { route: "/visitors" },
  { route: "/cameras" },
  { route: "/inventory" },
  { route: "/pricing" },
  { route: "/purchasing" },
  { route: "/shelf" },
  { route: "/stores" },
  { route: "/tasks" },
  { route: "/alerts" },
  { route: "/reports" },
  { route: "/knowledge" },
  { route: "/copilot" },
  { route: "/evals/compare" },
  { route: "/evals/benchmark" },
  { route: "/evals" },
  { route: "/traces" },
  { route: "/docs" },
  { route: "/settings" },
  { route: "/users" },
  { route: "/integrations" },
  { route: "/audit" },
] as const;

export function AppHeader({
  name,
  email,
  role,
  workspaceName,
}: {
  name: string;
  email: string;
  role: AppRole;
  workspaceName: string;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isLoggingOut, startLogout] = useTransition();

  const matched = ROUTE_LABELS.find(
    (item) => pathname === item.route || pathname.startsWith(`${item.route}/`),
  )?.route;

  const labels: Record<string, string> = {
    "/dashboard": t.nav.overview,
    "/visitors": t.nav.visitors,
    "/cameras": t.nav.cameras,
    "/inventory": t.nav.inventory,
    "/pricing": t.nav.pricing,
    "/purchasing": t.nav.purchasing,
    "/shelf": t.nav.shelf,
    "/stores": t.nav.stores,
    "/tasks": t.nav.tasks,
    "/alerts": t.nav.alerts,
    "/reports": t.nav.reports,
    "/knowledge": t.nav.knowledge,
    "/copilot": t.nav.copilot,
    "/evals/compare": t.lab.compare,
    "/evals/benchmark": t.lab.benchmark,
    "/evals": t.lab.evals,
    "/traces": t.lab.traces,
    "/docs": t.docs.title,
    "/settings": t.nav.settings,
    "/users": t.nav.users,
    "/integrations": t.nav.integrations,
    "/audit": t.nav.audit,
  };

  const currentLabel = matched ? labels[matched] : t.common.appName;

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border bg-background px-4 sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-2">
        <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label={t.nav.openMenu}
            onClick={() => setMobileOpen(true)}
          >
            <Menu />
          </Button>
          <DialogContent className="left-0 top-0 h-dvh w-72 max-w-[85vw] translate-x-0 translate-y-0 gap-0 rounded-none border-y-0 border-l-0 p-0">
            <DialogTitle className="sr-only">{t.nav.menu}</DialogTitle>
            <SidebarContent
              role={role}
              workspaceName={workspaceName}
              onNavigate={() => setMobileOpen(false)}
            />
          </DialogContent>
        </Dialog>

        <nav aria-label={t.common.breadcrumbAria} className="min-w-0">
          <ol className="flex items-center gap-1.5 text-sm">
            <li className="hidden text-muted-foreground sm:block">ShelfOpsRetail</li>
            <li className="hidden text-muted-foreground sm:block" aria-hidden="true">
              /
            </li>
            <li className="truncate font-medium text-foreground" aria-current="page">
              {currentLabel}
            </li>
          </ol>
        </nav>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2">
        <LocaleToggle />
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={t.nav.notifications}
        >
          <Link href="/alerts">
            <Bell />
          </Link>
        </Button>
        <span className="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-lg p-1 pr-1.5 text-left transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label={`${name}, ${t.roles[role] ?? role}`}
            >
              <Avatar name={name} />
              <span className="hidden min-w-0 flex-col sm:flex">
                <span className="max-w-36 truncate text-xs font-medium leading-4 text-foreground">
                  {name}
                </span>
                <span className="max-w-36 truncate text-[11px] leading-4 text-muted-foreground">
                  {t.roles[role] ?? role}
                </span>
              </span>
              <ChevronDown className="hidden size-3.5 text-muted-foreground sm:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="space-y-0.5 py-2">
              <span className="block truncate text-sm font-medium text-foreground">
                {name}
              </span>
              <span className="block truncate text-xs font-normal text-muted-foreground">
                {email}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings className="size-4" />
                {t.nav.settings}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={isLoggingOut}
              onSelect={(event) => {
                event.preventDefault();
                startLogout(async () => {
                  await logoutAction();
                });
              }}
              className="text-danger-strong"
            >
              <LogOut className="size-4" />
              {t.nav.logout}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

