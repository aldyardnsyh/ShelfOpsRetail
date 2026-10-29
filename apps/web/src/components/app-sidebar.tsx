"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  BarChart,
  Bell,
  BookOpen,
  Camera,
  CheckCircle,
  ClipboardList,
  FileText,
  History,
  Layers,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  Plug,
  Settings,
  Sliders,
  Store,
  Tag,
  Truck,
  Users,
} from "@/components/icons";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n/client";
import type { AppRole } from "@/lib/types";
import { can } from "@/lib/permissions";
import { isAdminRole } from "@/lib/types";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
  labOnly?: boolean;
}

export function SidebarContent({
  role,
  workspaceName,
  onNavigate,
  className,
}: {
  role: AppRole;
  workspaceName: string;
  onNavigate?: () => void;
  className?: string;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const admin = isAdminRole(role);

  const groups: NavGroup[] = [
    {
      label: t.nav.groupMonitor,
      items: [
        { href: "/dashboard", label: t.nav.overview, icon: LayoutDashboard },
        { href: "/cameras", label: t.nav.cameras, icon: Camera },
        { href: "/visitors", label: t.nav.visitors, icon: Users },
      ],
    },
    {
      label: t.nav.groupOperations,
      items: [
        { href: "/inventory", label: t.nav.inventory, icon: Layers },
        { href: "/pricing", label: t.nav.pricing, icon: Tag },
        { href: "/purchasing", label: t.nav.purchasing, icon: Truck },
        { href: "/tracking", label: t.nav.tracking, icon: MapPin },
        { href: "/shelf", label: t.nav.shelf, icon: ClipboardList },
        { href: "/stores", label: t.nav.stores, icon: Store },
      ],
    },
    {
      label: t.nav.groupAction,
      items: [
        { href: "/tasks", label: t.nav.tasks, icon: CheckCircle },
        { href: "/alerts", label: t.nav.alerts, icon: Bell },
        { href: "/reports", label: t.nav.reports, icon: BarChart },
      ],
    },
    {
      label: t.nav.groupKnowledge,
      items: [
        { href: "/copilot", label: t.nav.copilot, icon: MessageSquare },
        { href: "/knowledge", label: t.nav.knowledge, icon: BookOpen },
      ],
    },
    {
      label: t.nav.groupManagement,
      items: [
        { href: "/users", label: t.nav.users, icon: Users, adminOnly: true },
        { href: "/integrations", label: t.nav.integrations, icon: Plug, adminOnly: true },
        { href: "/audit", label: t.nav.audit, icon: History, adminOnly: true },
      ],
    },
    {
      label: t.lab.groupLabel,
      labOnly: true,
      items: [
        { href: "/evals", label: t.lab.evals, icon: Sliders },
        { href: "/evals/compare", label: t.lab.compare, icon: Sliders },
        { href: "/evals/benchmark", label: t.lab.benchmark, icon: Sliders },
        { href: "/traces", label: t.lab.traces, icon: FileText },
      ],
    },
    {
      label: t.nav.groupSystem,
      items: [
        { href: "/docs", label: t.lab.docs, icon: BookOpen },
        { href: "/settings", label: t.nav.settings, icon: Settings },
      ],
    },
  ];

  // Longest-prefix-wins: hanya SATU item boleh aktif, termasuk rute bersarang
  // (/shelf/new ikut mengaktifkan Rak & barang; /evals/compare tidak mengaktifkan Evals).
  const activeHref = groups
    .flatMap((group) => group.items.map((item) => item.href))
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];

  function isActive(href: string) {
    return href === activeHref;
  }

  return (
    <div className={cn("flex h-full flex-col bg-background", className)}>
      <div className="flex h-14 items-center border-b border-border px-4">
        <Logo />
      </div>
      <nav
        className="flex-1 overflow-y-auto px-2 py-3 [mask-image:linear-gradient(to_bottom,black_calc(100%-28px),transparent)]"
        aria-label={t.nav.menu}
      >
        {groups.map((group) => {
          if (group.labOnly && !can(role, "lab.run")) return null;
          const items = group.items.filter(
            (item) => !item.adminOnly || admin,
          );
          if (items.length === 0) return null;
          return (
            <div key={group.label} className="mb-3">
              <p className="px-2 pb-1 text-[11px] font-medium text-muted-foreground">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                          active
                            ? "bg-muted font-medium text-foreground"
                            : "text-muted-foreground hover:bg-surface-subtle hover:text-foreground",
                        )}
                      >
                        {active ? (
                          <span
                            className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent"
                            aria-hidden="true"
                          />
                        ) : null}
                        <Icon
                          className={cn(
                            "size-[18px] shrink-0",
                            active ? "text-foreground" : "text-muted-foreground",
                          )}
                        />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-border p-3">
        <div className="rounded-lg border border-border bg-surface-subtle px-3 py-2.5">
          <p className="truncate text-xs font-medium text-foreground">
            {workspaceName}
          </p>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <Badge variant="outline">{t.roles[role] ?? role}</Badge>
            <span className="text-[11px] text-muted-foreground">
              {t.common.appName}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppSidebar(props: {
  role: AppRole;
  workspaceName: string;
}) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-border lg:block">
      <SidebarContent {...props} />
    </aside>
  );
}

