import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  createStoreInGroup,
  deleteStoreInGroup,
  updateAutoGroup,
  updateProfitCenterSettings,
  updateStoreInGroup,
} from "@/app/admin/actions";
import { DEFAULT_BUY_BOX_SETTINGS } from "@/lib/profit-center/buyBox";
import { openStoreViewForGroupAction } from "@/app/app/group-actions";
import { requireAdminServiceClient } from "@/app/admin/admin-data";
import { formatProfileName, formatRoleLabel } from "@/lib/profile-display";
import { isPlatformStaff } from "@/lib/roles";
import FormWithSaveToast from "./FormWithSaveToast";
import AddUserModal from "./AddUserModal";

type PageProps = {
  params: { id: string };
  searchParams?: { activated?: string; emailError?: string };
};

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

  const [{ data: stores }, { data: users }, settingsResult] =
    await Promise.all([
    supabase
      .from("stores")
      .select("id, name, is_demo, created_at")
      .eq("dealer_group_id", id)
      .order("name", { ascending: true }),
    supabase
      .from("profiles")
      .select("id, user_id, email, first_name, last_name, phone, role, status, created_at")
      .eq("dealer_group_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("profit_center_settings")
      .select(
        "min_volume,weight_front,weight_back,weight_turn,weight_trade,list_size"
      )
      .eq("dealer_group_id", id)
      .maybeSingle(),
  ]);

  const pcSettings = settingsResult.error ? null : settingsResult.data;

  const accessKeys = (users ?? []).flatMap((u) => [u.id, u.user_id].filter(Boolean));
  let accessByProfile = new Map<string, string[]>();
  if (accessKeys.length > 0) {
    const { data: accessRows } = await supabase
      .from("user_store_access")
      .select("user_id, store_id")
      .in("user_id", accessKeys);
    const userByAuthId = new Map((users ?? []).map((u) => [u.user_id, u.id]));
    for (const row of accessRows ?? []) {
      const profileKey = userByAuthId.get(row.user_id) ?? row.user_id;
      const list = accessByProfile.get(profileKey) ?? [];
      list.push(row.store_id);
      accessByProfile.set(profileKey, list);
      // Also index by auth user_id for lookup flexibility
      if (profileKey !== row.user_id) {
        const byAuth = accessByProfile.get(row.user_id) ?? [];
        byAuth.push(row.store_id);
        accessByProfile.set(row.user_id, byAuth);
      }
    }
  }

  return {
    group,
    stores: stores ?? [],
    users: users ?? [],
    accessByProfile,
    pcSettings: pcSettings ?? null,
  };
}

export default async function AdminGroupDetailPage({ params, searchParams }: PageProps) {
  const { id } = params;
  const detail = await getGroupDetail(id);
  if (!detail) notFound();

  const { group, stores, users, accessByProfile, pcSettings } = detail;
  const storeOptions = stores.map((s) => ({ id: s.id, name: s.name }));
  const storeNameById = new Map(stores.map((s) => [s.id, s.name]));
  const activated = searchParams?.activated === "1";
  const emailError = searchParams?.emailError
    ? decodeURIComponent(searchParams.emailError)
    : null;

  const buyBox = {
    min_volume: pcSettings?.min_volume ?? DEFAULT_BUY_BOX_SETTINGS.minVolume,
    weight_front: Number(
      pcSettings?.weight_front ?? DEFAULT_BUY_BOX_SETTINGS.weightFront
    ),
    weight_back: Number(
      pcSettings?.weight_back ?? DEFAULT_BUY_BOX_SETTINGS.weightBack
    ),
    weight_turn: Number(
      pcSettings?.weight_turn ?? DEFAULT_BUY_BOX_SETTINGS.weightTurn
    ),
    weight_trade: Number(
      pcSettings?.weight_trade ?? DEFAULT_BUY_BOX_SETTINGS.weightTrade
    ),
    list_size: pcSettings?.list_size ?? DEFAULT_BUY_BOX_SETTINGS.listSize,
  };

  return (
    <div className="space-y-6">
      {activated ? (
        <div className="rounded-md border border-[color-mix(in_srgb,var(--da-green)_35%,transparent)] bg-[color-mix(in_srgb,var(--da-green)_12%,transparent)] px-3 py-2 text-sm text-[var(--da-green)]">
          Auto group activated. The group admin can sign in at /login.
          {emailError ? (
            <span className="mt-1 block text-amber-800">
              Activation email could not be sent: {emailError}. Add RESEND_API_KEY / EMAIL_FROM and
              retry from the request if needed.
            </span>
          ) : null}
        </div>
      ) : null}
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
          <CardTitle className="text-sm font-semibold">Group settings</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={updateAutoGroup} className="grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="id" value={group.id} />
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="group_name">
                Name
              </label>
              <Input id="group_name" name="name" defaultValue={group.name} required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="group_plan">
                Plan
              </label>
              <select
                id="group_plan"
                name="plan"
                defaultValue={group.plan}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="log">Log</option>
                <option value="analyze">Analyze</option>
                <option value="advise">Advise</option>
              </select>
            </div>
            <div className="sm:col-span-3">
              <Button type="submit" size="sm">
                Save group
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">
            Profit Center buy-box scoring
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">
            Models need at least the minimum deal count to receive a buy / red-light
            rating. Score = weighted mix of avg front, avg back, turn (lower age is
            better), and trade %. Weights are normalized to sum to 1 when saved.
          </p>
          <form action={updateProfitCenterSettings} className="grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="dealer_group_id" value={group.id} />
            <div>
              <label
                className="mb-1 block text-xs font-medium text-muted-foreground"
                htmlFor="min_volume"
              >
                Min deals to rate
              </label>
              <Input
                id="min_volume"
                name="min_volume"
                type="number"
                min={1}
                step={1}
                defaultValue={buyBox.min_volume}
                required
              />
            </div>
            <div>
              <label
                className="mb-1 block text-xs font-medium text-muted-foreground"
                htmlFor="list_size"
              >
                List size (buy &amp; red)
              </label>
              <Input
                id="list_size"
                name="list_size"
                type="number"
                min={1}
                step={1}
                defaultValue={buyBox.list_size}
                required
              />
            </div>
            <div className="hidden sm:block" />
            <div>
              <label
                className="mb-1 block text-xs font-medium text-muted-foreground"
                htmlFor="weight_front"
              >
                Weight · front profit
              </label>
              <Input
                id="weight_front"
                name="weight_front"
                type="number"
                min={0}
                step={0.01}
                defaultValue={buyBox.weight_front}
                required
              />
            </div>
            <div>
              <label
                className="mb-1 block text-xs font-medium text-muted-foreground"
                htmlFor="weight_back"
              >
                Weight · back profit
              </label>
              <Input
                id="weight_back"
                name="weight_back"
                type="number"
                min={0}
                step={0.01}
                defaultValue={buyBox.weight_back}
                required
              />
            </div>
            <div>
              <label
                className="mb-1 block text-xs font-medium text-muted-foreground"
                htmlFor="weight_turn"
              >
                Weight · turn
              </label>
              <Input
                id="weight_turn"
                name="weight_turn"
                type="number"
                min={0}
                step={0.01}
                defaultValue={buyBox.weight_turn}
                required
              />
            </div>
            <div>
              <label
                className="mb-1 block text-xs font-medium text-muted-foreground"
                htmlFor="weight_trade"
              >
                Weight · trade %
              </label>
              <Input
                id="weight_trade"
                name="weight_trade"
                type="number"
                min={0}
                step={0.01}
                defaultValue={buyBox.weight_trade}
                required
              />
            </div>
            <div className="sm:col-span-3">
              <Button type="submit" size="sm">
                Save buy-box settings
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Stores ({stores.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={createStoreInGroup} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="dealer_group_id" value={group.id} />
            <div className="min-w-[220px] flex-1">
              <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="store_name">
                Store name
              </label>
              <Input id="store_name" name="name" placeholder="Centralia" required />
            </div>
            <Button type="submit">Add store</Button>
          </form>

          <div className="-mx-6 border-t border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Store</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stores.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-sm text-muted-foreground">
                      No stores yet.
                    </TableCell>
                  </TableRow>
                )}
                {stores.map((store) => (
                  <TableRow key={store.id}>
                    <TableCell>
                      <form action={updateStoreInGroup} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={store.id} />
                        <input type="hidden" name="dealer_group_id" value={group.id} />
                        <Input
                          name="name"
                          defaultValue={store.name}
                          aria-label="Store name"
                          className="max-w-xs"
                        />
                        {store.is_demo ? <Badge variant="outline">Demo</Badge> : null}
                        <Button type="submit" size="sm" variant="outline">
                          Save
                        </Button>
                      </form>
                    </TableCell>
                    <TableCell className="text-right">
                      <form action={deleteStoreInGroup}>
                        <input type="hidden" name="id" value={store.id} />
                        <input type="hidden" name="dealer_group_id" value={group.id} />
                        <Button type="submit" size="sm" variant="ghost">
                          Delete
                        </Button>
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
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-semibold">Users ({users.length})</CardTitle>
          <AddUserModal dealerGroupId={group.id} stores={storeOptions} />
        </CardHeader>
        <CardContent className="space-y-3">
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users assigned to this group yet.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {users.map((user) => {
                const platformStaff = isPlatformStaff(user.role);
                const assignedStoreIds = accessByProfile.get(user.id) ?? [];
                const assignedNames = assignedStoreIds
                  .map((sid) => storeNameById.get(sid))
                  .filter(Boolean);
                const displayName = formatProfileName(user.first_name, user.last_name);

                return (
                  <li key={user.id}>
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-muted/60"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          {displayName}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{user.email}</div>
                        {platformStaff ? (
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            Managed as platform staff
                          </div>
                        ) : user.role === "store_admin" && assignedNames.length > 0 ? (
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            Stores: {assignedNames.join(", ")}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline">{formatRoleLabel(user.role)}</Badge>
                        <Badge
                          variant={
                            user.status === "active"
                              ? "success"
                              : user.status === "invited"
                                ? "warning"
                                : "outline"
                          }
                        >
                          {user.status}
                        </Badge>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
