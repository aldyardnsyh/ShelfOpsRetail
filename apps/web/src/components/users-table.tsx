"use client";

import type { Member, Role } from "@shelfops/api-client";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { inviteMemberAction, type InviteMemberState } from "@/actions/members";
import { Avatar } from "@/components/avatar";
import { EmptyState } from "@/components/empty-state";
import { Warning } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import type { Dictionary } from "@/lib/i18n";
import { formatDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/client";

const initialState: InviteMemberState = { status: "idle" };
const ROLES: Role[] = ["admin", "analyst", "auditor", "viewer"];

function InviteForm({
  demoMode,
  onDemoSubmit,
  onClose,
  t,
}: {
  demoMode: boolean;
  onDemoSubmit: (formData: FormData) => void;
  onClose: () => void;
  t: Dictionary;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    inviteMemberAction,
    initialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      toast({ title: t.users.inviteSuccess, variant: "success" });
      onClose();
      router.refresh();
    }
    if (state.status === "demo") {
      toast({
        title: t.users.inviteSuccess,
        description: t.users.inviteDemo,
        variant: "info",
      });
      onClose();
    }
    if (state.status === "error") {
      toast({
        title: t.users.inviteError,
        description: state.code === "invalidEmail" ? t.users.invalidEmail : state.detail,
        variant: "error",
      });
    }
  }, [state, router, t, toast, onClose]);

  const errorMessage =
    state.status === "error"
      ? state.code === "invalidEmail"
        ? t.users.invalidEmail
        : state.code === "forbidden"
          ? t.states.forbiddenBody
          : state.code === "network"
            ? t.states.offlineBody
            : (state.detail ?? t.users.inviteError)
      : null;

  return (
    <form action={demoMode ? onDemoSubmit : formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="invite-email">{t.users.inviteEmail}</Label>
        <Input
          id="invite-email"
          name="email"
          type="email"
          placeholder={t.users.inviteEmailPlaceholder}
          required
          autoComplete="email"
          disabled={pending}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="invite-role">{t.users.inviteRole}</Label>
        <select
          id="invite-role"
          name="role"
          defaultValue="viewer"
          disabled={pending}
          className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25 sm:h-9"
        >
          {ROLES.map((role) => (
            <option key={role} value={role}>
              {t.roles[role]}
            </option>
          ))}
        </select>
      </div>

      {errorMessage ? (
        <div
          className="flex items-start gap-2 rounded-lg border border-danger-soft-border bg-danger-soft p-3 text-sm text-danger-strong"
          role="alert"
        >
          <Warning className="mt-0.5 size-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onClose}>
          {t.common.cancel}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? `${t.users.inviting}...` : t.users.inviteCta}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function UsersTable({
  members: initialMembers,
  demoMode,
}: {
  members: Member[];
  demoMode: boolean;
}) {
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const [members, setMembers] = useState(initialMembers);
  const [open, setOpen] = useState(false);

  function onDemoSubmit(formData: FormData) {
    const email = String(formData.get("email") ?? "").trim();
    const roleRaw = String(formData.get("role") ?? "viewer") as Role;
    const role = ROLES.includes(roleRaw) ? roleRaw : "viewer";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: t.users.invalidEmail, variant: "error" });
      return;
    }
    const name = email
      .split("@")[0]
      ?.split(/[._-]/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
    setMembers((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        user: { id: crypto.randomUUID(), email, name: name || email },
        role,
        created_at: new Date().toISOString(),
      },
    ]);
    toast({
      title: t.users.inviteSuccess,
      description: t.users.inviteDemo,
      variant: "info",
    });
    setOpen(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {members.length} {t.users.count}
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button type="button">{t.users.invite}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t.users.inviteTitle}</DialogTitle>
              <DialogDescription>{t.users.inviteBody}</DialogDescription>
            </DialogHeader>
            <InviteForm
              demoMode={demoMode}
              onDemoSubmit={onDemoSubmit}
              onClose={() => setOpen(false)}
              t={t}
            />
          </DialogContent>
        </Dialog>
      </div>

      {members.length === 0 ? (
        <EmptyState title={t.users.emptyTitle} body={t.users.emptyBody} />
      ) : (
        <div className="rounded-lg border border-border">
          <Table aria-label={t.users.title}>
            <TableHeader>
              <TableRow>
                <TableHead>{t.common.name}</TableHead>
                <TableHead className="w-36">{t.common.role}</TableHead>
                <TableHead className="hidden w-32 whitespace-nowrap text-right sm:table-cell">
                  {t.users.memberSince}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="min-w-52">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={member.user.name} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {member.user.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {member.user.email}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={member.role === "admin" ? "accent" : "outline"}>
                      {t.roles[member.role] ?? member.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-right text-xs text-muted-foreground sm:table-cell">
                    {formatDate(member.created_at, locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
