import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createAutoGroup } from "@/app/admin/actions";
import { requireAdminServiceClient } from "@/app/admin/admin-data";

type GroupRow = {
  id: string;
  name: string;
  plan: string;
  is_demo: boolean;
  created_at: string;
  store_count: number;
  user_count: number;
};

async function getGroups(): Promise<GroupRow[]> {
  const supabase = await requireAdminServiceClient();
  const { data, error } = await supabase
    .from("dealer_groups")
    .select("id, name, plan, is_demo, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading dealer_groups", error);
    return [];
  }

  const groups = data ?? [];
  if (groups.length === 0) return [];

  const ids = groups.map((g) => g.id);
  const [{ data: stores }, { data: users }] = await Promise.all([
    supabase.from("stores").select("id, dealer_group_id").in("dealer_group_id", ids),
    supabase.from("profiles").select("id, dealer_group_id").in("dealer_group_id", ids),
  ]);

  const storeCount = new Map<string, number>();
  const userCount = new Map<string, number>();
  for (const s of stores ?? []) {
    storeCount.set(s.dealer_group_id, (storeCount.get(s.dealer_group_id) ?? 0) + 1);
  }
  for (const u of users ?? []) {
    if (!u.dealer_group_id) continue;
    userCount.set(u.dealer_group_id, (userCount.get(u.dealer_group_id) ?? 0) + 1);
  }

  return groups.map((g) => ({
    ...g,
    store_count: storeCount.get(g.id) ?? 0,
    user_count: userCount.get(g.id) ?? 0,
  }));
}

export default async function AdminGroupsPage() {
  const groups = await getGroups();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Auto Groups</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage automotive dealer groups. Stores and users live inside each group.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Create auto group</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createAutoGroup} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="name">
                Name
              </label>
              <Input id="name" name="name" required placeholder="Acme Motors Group" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="plan">
                Plan
              </label>
              <select
                id="plan"
                name="plan"
                defaultValue="free"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="free">Free</option>
                <option value="paid">Paid</option>
                <option value="premium">Premium</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button type="submit">Create group</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">All auto groups</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Stores</TableHead>
                <TableHead>Users</TableHead>
                <TableHead className="text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-muted-foreground">
                    No auto groups yet. Create one above.
                  </TableCell>
                </TableRow>
              )}
              {groups.map((g) => (
                <TableRow key={g.id}>
                  <TableCell>
                    <div className="text-sm font-medium">{g.name}</div>
                    {g.is_demo ? (
                      <Badge variant="outline" className="mt-1">
                        Demo
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-sm capitalize">{g.plan}</TableCell>
                  <TableCell className="text-sm">{g.store_count}</TableCell>
                  <TableCell className="text-sm">{g.user_count}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/groups/${g.id}`}>Manage</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
