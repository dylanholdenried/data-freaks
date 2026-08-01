import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdminServiceClient } from "@/app/admin/admin-data";
import { isAutoGroupUserRole, isPlatformAdminListRole } from "@/lib/roles";
import UserSearchList, { type UserListRow } from "./UserSearchList";
import AddAutoGroupUserModal from "./AddAutoGroupUserModal";

export default async function AdminUsersPage() {
  const supabase = await requireAdminServiceClient();

  const [{ data: profiles }, { data: groups }, { data: stores }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, email, first_name, last_name, role, status, dealer_group_id, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("dealer_groups").select("id, name").order("name", { ascending: true }),
    supabase
      .from("stores")
      .select("id, name, dealer_group_id")
      .order("name", { ascending: true }),
  ]);

  const groupNameById = new Map((groups ?? []).map((g) => [g.id, g.name]));

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

  const autoGroupUsers: UserListRow[] = (profiles ?? [])
    .filter((p) => isAutoGroupUserRole(p.role))
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
          <AddAutoGroupUserModal
            groups={(groups ?? []).map((g) => ({ id: g.id, name: g.name }))}
            stores={(stores ?? []).map((s) => ({
              id: s.id,
              name: s.name,
              dealer_group_id: s.dealer_group_id,
            }))}
          />
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
