import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { getEffectiveDealerGroupId } from "@/lib/dealer-group-context";
import { getAccessibleStores } from "@/lib/store-access";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addCalendarDay } from "@/app/app/actions";
import SelectAutoGroupEmptyState from "../SelectAutoGroupEmptyState";

export default async function CalendarPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, dealer_group_id, role")
    .or(profileMatchAuthUserId(session!.user.id))
    .maybeSingle();

  const dealerGroupId = await getEffectiveDealerGroupId(profile);

  if (!dealerGroupId || !profile) {
    return <SelectAutoGroupEmptyState />;
  }

  const stores = await getAccessibleStores(supabase, profile);
  const storeIds = stores.map((s) => s.id);
  const { data: calendarDays } = storeIds.length
    ? await supabase
        .from("store_calendar_days")
        .select("store_id,date,is_working_day")
        .in("store_id", storeIds)
    : { data: [] as { store_id: string; date: string; is_working_day: boolean }[] };

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthRows = (calendarDays ?? []).filter((d) => {
    const dt = new Date(d.date);
    return dt.getFullYear() === year && dt.getMonth() === month;
  });

  const workingByStore = new Map<string, number>();
  for (const store of stores) {
    const count = monthRows.filter((d) => d.store_id === store.id && d.is_working_day).length;
    workingByStore.set(store.id, count);
  }

  const hasStores = stores.length > 0;

  return (
    <div className="space-y-6">
      <section className="app-panel p-5">
        <p className="app-kicker">Pace Configuration</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Operating Calendar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage operating days to control MTD pace math and quota projections.
        </p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[2fr,1fr]">
        <Card className="app-panel border-border shadow-none">
          <CardHeader className="border-border">
            <CardTitle className="text-lg">Current month working days by store</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {stores.map((store) => (
              <div key={store.id} className="rounded-xl border border-border bg-muted p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">{store.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {workingByStore.get(store.id) ?? 0} working days
                  </p>
                </div>
                <div className="h-2 rounded-full bg-[var(--da-line)]">
                  <div
                    className="h-2 rounded-full bg-[var(--da-blue)]"
                    style={{
                      width: `${Math.min(((workingByStore.get(store.id) ?? 0) / 31) * 100, 100)}%`
                    }}
                  />
                </div>
              </div>
            ))}
            {!hasStores && (
              <p className="text-sm text-muted-foreground">No stores available for your account.</p>
            )}
          </CardContent>
        </Card>

        <Card className="app-panel border-border shadow-none">
          <CardHeader className="border-border">
            <CardTitle className="text-lg text-foreground">Quick Day Toggle</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={addCalendarDay} className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Store</label>
                <select
                  name="store_id"
                  required
                  disabled={!hasStores}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground disabled:opacity-50"
                >
                  {!hasStores && (
                    <option value="">No accessible stores</option>
                  )}
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Date</label>
                <Input type="date" name="calendar_date" className="mt-1" required />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Working day?</label>
                <select
                  name="is_working_day"
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                >
                  <option value="true">Yes</option>
                  <option value="false">Closed</option>
                </select>
              </div>
              <Button type="submit" disabled={!hasStores} className="w-full">
                Commit changes
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
