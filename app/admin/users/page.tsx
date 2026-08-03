import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdminServiceClient } from "@/app/admin/admin-data";
import { isAutoGroupUserRole, isPlatformAdminListRole } from "@/lib/roles";
import { formatProfileName, formatStatusLabel } from "@/lib/profile-display";
import UserSearchList, { type UserListRow } from "./UserSearchList";
import AddAutoGroupUserModal from "./AddAutoGroupUserModal";
import AssignExistingAccessModal from "@/app/admin/requests/AssignExistingAccessModal";

type UserRequestRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  dealer_group_name: string;
  notes: string | null;
  created_at: string;
  requested_user_id: string | null;
  request_mode: "new" | "existing";
  profileId: string | null;
};

function resolveRequestMode(
  request_mode: string | null | undefined,
  notes: string | null | undefined
): "new" | "existing" {
  if (request_mode === "existing") return "existing";
  if (request_mode === "new") return "new";
  if (notes?.toLowerCase().startsWith("requested access to existing group:")) {
    return "existing";
  }
  return "new";
}

export default async function AdminUsersPage() {
  const supabase = await requireAdminServiceClient();

  const [{ data: profiles }, { data: groups }, { data: stores }, { data: pendingRequests }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, email, first_name, last_name, role, status, dealer_group_id, created_at, user_id")
        .order("created_at", { ascending: false }),
      supabase.from("dealer_groups").select("id, name").order("name", { ascending: true }),
      supabase
        .from("stores")
        .select("id, name, dealer_group_id")
        .order("name", { ascending: true }),
      supabase
        .from("dealer_group_requests")
        .select(
          "id, first_name, last_name, email, dealer_group_name, notes, created_at, requested_user_id, status, request_mode"
        )
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);

  const groupNameById = new Map((groups ?? []).map((g) => [g.id, g.name]));
  const groupOptions = (groups ?? []).map((g) => ({ id: g.id, name: g.name }));
  const storeOptions = (stores ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    dealer_group_id: s.dealer_group_id,
  }));

  const profileIdByAuthId = new Map<string, string>();
  for (const p of profiles ?? []) {
    profileIdByAuthId.set(p.id, p.id);
    if (p.user_id) profileIdByAuthId.set(p.user_id, p.id);
  }

  const userRequests: UserRequestRow[] = (pendingRequests ?? []).map((r) => ({
    id: r.id,
    first_name: r.first_name,
    last_name: r.last_name,
    email: r.email,
    dealer_group_name: r.dealer_group_name,
    notes: r.notes,
    created_at: r.created_at,
    requested_user_id: r.requested_user_id,
    request_mode: resolveRequestMode(r.request_mode, r.notes),
    profileId: r.requested_user_id
      ? profileIdByAuthId.get(r.requested_user_id) ?? null
      : null,
  }));

  const platformUsers: UserListRow[] = (profiles ?? [])
    .filter((p) => isPlatformAdminListRole(p.role))
    .map((p) => ({
      id: p.id,
      email: p.email,
      first_name: p.first_name,
      last_name: p.last_name,
      role: p.role,
      status: p.status,
    }));

  // Signup applicants (requested) live in User Requests — keep Auto Group Users for provisioned/invited accounts.
  const autoGroupUsers: UserListRow[] = (profiles ?? [])
    .filter((p) => isAutoGroupUserRole(p.role) && p.status !== "requested")
    .map((p) => ({
      id: p.id,
      email: p.email,
      first_name: p.first_name,
      last_name: p.last_name,
      role: p.role,
      status: p.status,
      groupName: p.dealer_group_id ? groupNameById.get(p.dealer_group_id) ?? null : null,
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View platform staff and auto group users across all dealer groups. Click a user to manage
          details and access.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">
            User Requests ({userRequests.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {userRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No pending signup requests. New applications from /signup appear here.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {userRequests.map((request) => {
                const displayName = formatProfileName(request.first_name, request.last_name);
                const isJoinExisting = request.request_mode === "existing";
                return (
                  <li
                    key={request.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">
                        {displayName}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{request.email}</div>
                      <div className="mt-1 text-xs font-medium text-foreground">
                        {request.dealer_group_name}
                      </div>
                      {request.notes ? (
                        <div className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
                          {request.notes}
                        </div>
                      ) : null}
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {new Date(request.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="warning">{formatStatusLabel("requested")}</Badge>
                      <Badge variant={isJoinExisting ? "outline" : "default"}>
                        {isJoinExisting ? "Join existing" : "New group"}
                      </Badge>
                      {request.profileId ? (
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/admin/users/${request.profileId}`}>View user</Link>
                        </Button>
                      ) : null}
                      {isJoinExisting ? (
                        <AssignExistingAccessModal
                          request={request}
                          groups={groupOptions}
                          stores={storeOptions}
                        />
                      ) : (
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/admin/requests/${request.id}/provision`}>Start setup</Link>
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">
            Platform Admins ({platformUsers.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <UserSearchList
            users={platformUsers}
            emptyLabel={
              platformUsers.length === 0
                ? "No platform admins found."
                : "No platform admins match your search."
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-semibold">
            Auto Group Users ({autoGroupUsers.length})
          </CardTitle>
          <AddAutoGroupUserModal groups={groupOptions} stores={storeOptions} />
        </CardHeader>
        <CardContent>
          <UserSearchList
            users={autoGroupUsers}
            showGroup
            emptyLabel={
              autoGroupUsers.length === 0
                ? "No auto group users yet. Add one to invite them."
                : "No users match your search."
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
