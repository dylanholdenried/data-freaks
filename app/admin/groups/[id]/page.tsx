import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  createStoreInGroup,
  createUserInGroup,
  deleteStoreInGroup,
  disableUserInGroup,
  updateAutoGroup,
  updateStoreInGroup,
  updateUserInGroup,
} from "@/app/admin/actions";
import { openStoreViewForGroupAction } from "@/app/app/group-actions";
import { requireAdminServiceClient } from "@/app/admin/admin-data";

type PageProps = { params: { id: string } };

async function getGroupDetail(id: string) {
  const supabase = await requireAdminServiceClient();

  const { data: group, error: groupError } = await supabase
    .from("dealer_groups")
    .select("id, name, plan, is_demo, created_at")
    .eq("id", id)
    .maybeSingle();

  if (groupError) {
    console.error("Error loading dealer_group", groupError);
  }
  if (!group) return null;

  const [{ data: stores }, { data: users }] = await Promise.all([
    supabase
      .from("stores")
      .select("id, name, is_demo, created_at")
      .eq("dealer_group_id", id)
      .order("name", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, user_id, email, first_name, last_name, role, status, created_at")
      .eq("dealer_group_id", id)
      .order("created_at", { ascending: false }),
  ]);

  return {
    group,
    stores: stores ?? [],
    users: users ?? [],
  };
}

export default async function AdminGroupDetailPage({ params }: PageProps) {
  const { id } = params;
  const detail = await getGroupDetail(id);
  if (!detail) notFound();

  const { group, stores, users } = detail;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/groups" className="text-xs font-medium text-blue-600 hover:underline">
            ← All auto groups
          </Link>
          <h1 className="mt-2 text-xl font-semibold tracking-tight">{group.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            View and manage stores and users for this auto group.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {group.is_demo ? <Badge variant="outline">Demo</Badge> : null}
          <Badge variant="success" className="capitalize">
            {group.plan}
          </Badge>
          <form action={openStoreViewForGroupAction}>
            <input type="hidden" name="dealer_group_id" value={group.id} />
            <Button type="submit" size="sm" variant="outline">
              Open store view
            </Button>
          </form>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Group details</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateAutoGroup} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <input type="hidden" name="id" value={group.id} />
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="name">
                Name
              </label>
              <Input id="name" name="name" required defaultValue={group.name} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="plan">
                Plan
              </label>
              <select
                id="plan"
                name="plan"
                defaultValue={group.plan}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="free">Free</option>
                <option value="paid">Paid</option>
                <option value="premium">Premium</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button type="submit">Save group</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Stores ({stores.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={createStoreInGroup} className="grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="dealer_group_id" value={group.id} />
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="store_name">
                Store name
              </label>
              <Input id="store_name" name="name" required placeholder="Downtown" />
            </div>
            <div className="flex items-end">
              <Button type="submit">Add store</Button>
            </div>
          </form>

          <div className="-mx-6 border-t border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stores.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-sm text-muted-foreground">
                      No stores in this group yet.
                    </TableCell>
                  </TableRow>
                )}
                {stores.map((store) => (
                  <TableRow key={store.id}>
                    <TableCell colSpan={2} className="p-2">
                      <form
                        action={updateStoreInGroup}
                        className="grid items-end gap-2 sm:grid-cols-[1fr_auto]"
                      >
                        <input type="hidden" name="id" value={store.id} />
                        <input type="hidden" name="dealer_group_id" value={group.id} />
                        <Input name="name" required defaultValue={store.name} aria-label="Store name" />
                        <div className="flex justify-end gap-2">
                          <Button type="submit" size="sm" variant="outline">
                            Save
                          </Button>
                          <Button formAction={deleteStoreInGroup} type="submit" size="sm" variant="ghost">
                            Remove
                          </Button>
                        </div>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Users ({users.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={createUserInGroup} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <input type="hidden" name="dealer_group_id" value={group.id} />
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="user_first_name">
                First name
              </label>
              <Input id="user_first_name" name="first_name" placeholder="Jane" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="user_last_name">
                Last name
              </label>
              <Input id="user_last_name" name="last_name" placeholder="Doe" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="user_email">
                Email
              </label>
              <Input id="user_email" name="email" type="email" required placeholder="jane@dealer.com" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="user_role">
                Role
              </label>
              <select
                id="user_role"
                name="role"
                defaultValue="store_admin"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="store_admin">Store admin</option>
                <option value="group_admin">Group admin</option>
              </select>
            </div>
            <div className="flex items-end">
              <input type="hidden" name="status" value="active" />
              <Button type="submit">Add user</Button>
            </div>
          </form>

          <div className="-mx-6 border-t border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role / status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-sm text-muted-foreground">
                      No users assigned to this group yet.
                    </TableCell>
                  </TableRow>
                )}
                {users.map((user) => {
                  const isPlatformAdmin = user.role === "platform_admin";
                  if (isPlatformAdmin) {
                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="text-sm font-medium">
                            {[user.first_name, user.last_name].filter(Boolean).join(" ") || "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">{user.email}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="outline">{user.role}</Badge>
                            <Badge variant={user.status === "active" ? "success" : "warning"}>
                              {user.status}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          Managed as platform admin
                        </TableCell>
                      </TableRow>
                    );
                  }

                  return (
                    <TableRow key={user.id}>
                      <TableCell colSpan={3} className="p-2">
                        <form action={updateUserInGroup} className="space-y-2">
                          <input type="hidden" name="id" value={user.id} />
                          <input type="hidden" name="user_id" value={user.user_id} />
                          <input type="hidden" name="dealer_group_id" value={group.id} />
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            <Input
                              name="first_name"
                              defaultValue={user.first_name ?? ""}
                              placeholder="First name"
                              aria-label="First name"
                            />
                            <Input
                              name="last_name"
                              defaultValue={user.last_name ?? ""}
                              placeholder="Last name"
                              aria-label="Last name"
                            />
                            <Input
                              name="email"
                              type="email"
                              required
                              defaultValue={user.email}
                              aria-label="Email"
                              className="sm:col-span-2 lg:col-span-2"
                            />
                            <select
                              name="role"
                              defaultValue={user.role === "group_admin" ? "group_admin" : "store_admin"}
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                              aria-label="Role"
                            >
                              <option value="store_admin">Store admin</option>
                              <option value="group_admin">Group admin</option>
                            </select>
                            <select
                              name="status"
                              defaultValue={user.status}
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                              aria-label="Status"
                            >
                              <option value="invited">Invited</option>
                              <option value="active">Active</option>
                              <option value="disabled">Disabled</option>
                            </select>
                            <div className="flex justify-end gap-2 sm:col-span-2">
                              <Button type="submit" size="sm" variant="outline">
                                Save
                              </Button>
                              <Button
                                formAction={disableUserInGroup}
                                type="submit"
                                size="sm"
                                variant="ghost"
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        </form>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
