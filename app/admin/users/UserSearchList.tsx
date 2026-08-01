"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatProfileName, formatRoleLabel } from "@/lib/profile-display";

export type UserListRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  status: string;
  groupName?: string | null;
};

function statusVariant(status: string): "success" | "warning" | "outline" {
  if (status === "active") return "success";
  if (status === "invited") return "warning";
  return "outline";
}

function matchesSearch(user: UserListRow, q: string) {
  if (!q) return true;
  const name = formatProfileName(user.first_name, user.last_name).toLowerCase();
  const email = (user.email || "").toLowerCase();
  return name.includes(q) || email.includes(q);
}

export default function UserSearchList({
  users,
  emptyLabel,
  showGroup,
}: {
  users: UserListRow[];
  emptyLabel: string;
  showGroup?: boolean;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => users.filter((u) => matchesSearch(u, q)), [users, q]);

  return (
    <div className="space-y-3">
      <Input
        type="search"
        placeholder="Search by name or email…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search users"
        className="max-w-sm"
      />

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {filtered.map((user) => {
            const displayName = formatProfileName(user.first_name, user.last_name);
            return (
              <li key={user.id}>
                <Link
                  href={`/admin/users/${user.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-muted/60"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{displayName}</div>
                    <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                    {showGroup && user.groupName ? (
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{user.groupName}</div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline">{formatRoleLabel(user.role)}</Badge>
                    <Badge variant={statusVariant(user.status)}>{user.status}</Badge>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
