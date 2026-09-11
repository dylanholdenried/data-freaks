import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createStoreInGroup,
  deleteStoreInGroup,
  startStoreTrial90Days,
  updateAutoGroup,
  updateProfitCenterSettings,
  updateStoreInGroup,
} from "@/app/admin/actions";
import { DEFAULT_BUY_BOX_SETTINGS } from "@/lib/profit-center/buyBox";
import { openStoreViewForGroupAction } from "@/app/app/group-actions";
import { requireAdminServiceClient } from "@/app/admin/admin-data";
import { formatProfileName, formatRoleLabel, formatStatusLabel } from "@/lib/profile-display";
import { isPlatformStaff, isStoreScopedRole } from "@/lib/roles";
import {
  annualPriceCents,
  billingStatusLabel,
  DEFAULT_MONTHLY_PRICE_CENTS,
  formatMoneyFromCents,
} from "@/lib/billing";
import AddUserModal from "./AddUserModal";

type PageProps = {
  params: { id: string };
  searchParams?: { activated?: string; emailError?: string; billingSaved?: string };
};

function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

async function getGroupDetail(id: string) {
  const supabase = await requireAdminServiceClient();

  const { data: group, error: groupError } = await supabase
    .from("dealer_groups")
    .select("id, name, plan, acquire_enabled, is_demo, created_at")
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
      .select(
        "id, name, is_demo, created_at, plan, acquire_enabled, billing_interval, billing_status, trial_ends_at, current_period_end, bulk_import_window_ends_at, activation_fee_paid_at, monthly_price_cents"
      )
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
  const billingSaved = searchParams?.billingSaved === "1";
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

  const analyzeStores = stores.filter((s) => s.plan === "analyze");
  const monthlyTotal = analyzeStores.reduce(
    (sum, s) => sum + (s.monthly_price_cents ?? DEFAULT_MONTHLY_PRICE_CENTS),
    0
  );
  const annualTotal = analyzeStores.reduce(
    (sum, s) =>
      sum + annualPriceCents(s.monthly_price_cents ?? DEFAULT_MONTHLY_PRICE_CENTS),
    0
  );
  const acquireStores = stores.filter((s) => s.acquire_enabled);
  const derivedPlan =
    group.plan === "analyze" || analyzeStores.length > 0 ? "analyze" : "log";

  return (
    <div className="space-y-6">
      {billingSaved ? (
        <div className="rounded-md border border-[color-mix(in_srgb,var(--da-green)_35%,transparent)] bg-[color-mix(in_srgb,var(--da-green)_12%,transparent)] px-3 py-2 text-sm text-[var(--da-green)]">
          Store billing saved. Open store view → Billing to confirm the updated prices.
        </div>
      ) : null}
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
            View and manage stores, billing, and users for this auto group.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {group.is_demo ? <Badge variant="outline">Demo</Badge> : null}
          <Badge variant="success" className="capitalize">
            {derivedPlan} (derived)
          </Badge>
          {group.acquire_enabled ? <Badge variant="outline">Acquire</Badge> : null}
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
                Apply plan to all stores
              </label>
              <select
                id="group_plan"
                name="plan"
                defaultValue={derivedPlan}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="log">Log</option>
                <option value="analyze">Analyze</option>
              </select>
            </div>
            <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" name="apply_plan_to_stores" value="1" className="rounded border" />
                Also apply selected plan to every store (overwrites per-store plan)
              </label>
              <Button type="submit" size="sm">
                Save group
              </Button>
            </div>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            Group plan badge is derived from stores. Edit payment level per store below for trials
            and beta onboarding.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Payment details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Analyze stores</p>
              <p className="mt-1 text-xl font-semibold">{analyzeStores.length}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Monthly list</p>
              <p className="mt-1 text-xl font-semibold">{formatMoneyFromCents(monthlyTotal)}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Annual prepay</p>
              <p className="mt-1 text-xl font-semibold">{formatMoneyFromCents(annualTotal)}</p>
            </div>
          </div>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {stores.length === 0 ? (
              <li className="px-3 py-2 text-muted-foreground">No stores yet.</li>
            ) : (
              stores.map((s) => {
                const price = s.monthly_price_cents ?? DEFAULT_MONTHLY_PRICE_CENTS;
                return (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <div>
                      <span className="font-medium">{s.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground capitalize">
                        {s.plan === "analyze" ? "Analyze" : "Log"} ·{" "}
                        {billingStatusLabel(s.billing_status)}
                        {s.acquire_enabled ? " · Acquire" : ""}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {s.plan === "analyze"
                        ? `${formatMoneyFromCents(price)}/mo · ${formatMoneyFromCents(annualPriceCents(price))}/yr`
                        : "$0"}
                    </div>
                  </li>
                );
              })
            )}
          </ul>
          {acquireStores.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Acquire on {acquireStores.map((s) => s.name).join(", ")} — $400/unit billed next month
              (manual until Stripe).
            </p>
          ) : null}
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
                Weight · front
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
                Weight · back
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
          <CardTitle className="text-sm font-semibold">Stores & billing ({stores.length})</CardTitle>
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

          <div className="space-y-4">
            {stores.length === 0 ? (
              <p className="text-sm text-muted-foreground">No stores yet.</p>
            ) : (
              stores.map((store) => (
                <div
                  key={store.id}
                  className="rounded-lg border border-border p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{store.name}</span>
                      {store.is_demo ? <Badge variant="outline">Demo</Badge> : null}
                      <Badge variant="outline" className="capitalize">
                        {store.plan === "analyze" ? "Analyze" : "Log"}
                      </Badge>
                      <Badge variant="outline">{billingStatusLabel(store.billing_status)}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <form action={startStoreTrial90Days}>
                        <input type="hidden" name="id" value={store.id} />
                        <input type="hidden" name="dealer_group_id" value={group.id} />
                        <Button type="submit" size="sm" variant="secondary">
                          Start 90-day trial
                        </Button>
                      </form>
                      <form action={deleteStoreInGroup}>
                        <input type="hidden" name="id" value={store.id} />
                        <input type="hidden" name="dealer_group_id" value={group.id} />
                        <Button type="submit" size="sm" variant="ghost">
                          Delete
                        </Button>
                      </form>
                    </div>
                  </div>

                  <form action={updateStoreInGroup} className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    <input type="hidden" name="id" value={store.id} />
                    <input type="hidden" name="dealer_group_id" value={group.id} />
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        Store name
                      </label>
                      <Input name="name" defaultValue={store.name} required />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        Plan
                      </label>
                      <select
                        name="plan"
                        defaultValue={store.plan === "analyze" ? "analyze" : "log"}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="log">Log</option>
                        <option value="analyze">Analyze</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        Billing status
                      </label>
                      <select
                        name="billing_status"
                        defaultValue={store.billing_status ?? "none"}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="none">None (Log)</option>
                        <option value="trialing">Trialing</option>
                        <option value="active">Active</option>
                        <option value="past_due">Past due</option>
                        <option value="canceled">Canceled</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        Interval
                      </label>
                      <select
                        name="billing_interval"
                        defaultValue={store.billing_interval ?? ""}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      >
                        <option value="">—</option>
                        <option value="monthly">Monthly</option>
                        <option value="annual">Annual</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        Monthly price (USD)
                      </label>
                      <Input
                        name="monthly_price_dollars"
                        type="number"
                        min={0}
                        step={1}
                        defaultValue={Math.round(
                          (store.monthly_price_cents ?? DEFAULT_MONTHLY_PRICE_CENTS) / 100
                        )}
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        List price for this rooftop (e.g. 2500 = $2,500/mo)
                      </p>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        Trial ends
                      </label>
                      <Input
                        name="trial_ends_at"
                        type="date"
                        defaultValue={toDateInputValue(store.trial_ends_at)}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        Period end
                      </label>
                      <Input
                        name="current_period_end"
                        type="date"
                        defaultValue={toDateInputValue(store.current_period_end)}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">
                        Bulk import window ends
                      </label>
                      <Input
                        name="bulk_import_window_ends_at"
                        type="date"
                        defaultValue={toDateInputValue(store.bulk_import_window_ends_at)}
                      />
                    </div>
                    <div className="flex flex-col justify-end gap-2 sm:col-span-2 lg:col-span-4">
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          name="acquire_enabled"
                          value="1"
                          defaultChecked={Boolean(store.acquire_enabled)}
                          className="rounded border"
                        />
                        Acquire enabled
                      </label>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          name="activation_fee_paid"
                          value="1"
                          defaultChecked={Boolean(store.activation_fee_paid_at)}
                          className="rounded border"
                        />
                        Activation fee paid
                        {store.activation_fee_paid_at
                          ? ` (${toDateInputValue(store.activation_fee_paid_at)})`
                          : ""}
                      </label>
                      {store.activation_fee_paid_at ? (
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            name="clear_activation_fee"
                            value="1"
                            className="rounded border"
                          />
                          Clear activation fee paid date
                        </label>
                      ) : null}
                      <div>
                        <Button type="submit" size="sm">
                          Save store billing
                        </Button>
                      </div>
                    </div>
                  </form>
                </div>
              ))
            )}
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
                        ) : isStoreScopedRole(user.role) && assignedNames.length > 0 ? (
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
                              : user.status === "invited" || user.status === "requested"
                                ? "warning"
                                : "outline"
                          }
                        >
                          {formatStatusLabel(user.status)}
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
