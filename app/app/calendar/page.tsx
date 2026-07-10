import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addCalendarDay } from "@/app/app/actions";

export default async function CalendarPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();

  const { data: profile } = await supabase
    .from("profiles")
    .select("dealer_group_id")
    .or(profileMatchAuthUserId(session!.user.id))
    .maybeSingle();

  const { data: stores } = await supabase.from("stores").select("id,name").eq("dealer_group_id", profile?.dealer_group_id);
  const storeIds = (stores ?? []).map((s: any) => s.id);
  const { data: calendarDays } = await supabase
    .from("store_calendar_days")
    .select("store_id,calendar_date,is_working_day")
    .in("store_id", storeIds);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthRows = (calendarDays ?? []).filter((d: any) => {
    const dt = new Date(d.calendar_date);
    return dt.getFullYear() === year && dt.getMonth() === month;
  });

  const workingByStore = new Map<string, number>();
  for (const store of stores ?? []) {
    const count = monthRows.filter((d: any) => d.store_id === store.id && d.is_working_day).length;
    workingByStore.set(store.id, count);
  }

  const hasStores = (stores ?? []).length > 0;

  return (
    <div className="space-y-6">
      <section className="app-panel p-5">
        <p className="app-kicker">Pace Configuration</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Operating Calendar</h1>
        <p className="mt-1 text-sm text-slate-500">Manage operating days to control MTD pace math and quota projections.</p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[2fr,1fr]">
        <Card className="app-panel border-[#e7ebf3] shadow-none">
          <CardHeader className="border-[#edf1f7]">
            <CardTitle className="text-lg">Current month working days by store</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(stores ?? []).map((store: any) => (
              <div key={store.id} className="rounded-xl border border-[#edf1f7] bg-[#fafcff] p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">{store.name}</p>
                  <p className="text-xs text-slate-500">{workingByStore.get(store.id) ?? 0} working days</p>
                </div>
                <div className="h-2 rounded-full bg-slate-200">
                  <div
                    className="h-2 rounded-full bg-blue-500"
                    style={{
                      width: `${Math.min(((workingByStore.get(store.id) ?? 0) / 31) * 100, 100)}%`
                    }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-0 bg-gradient-to-br from-[#081d48] to-[#102a69] text-white shadow-xl shadow-blue-900/20">
          <CardHeader className="border-white/10">
            <CardTitle className="text-lg text-white">Quick Day Toggle</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={addCalendarDay} className="space-y-3">
              <div>
                <label className="text-xs text-blue-200">Store</label>
                <select
                  name="store_id"
                  required
                  disabled={!hasStores}
                  className="mt-1 h-10 w-full rounded-md border border-white/20 bg-white/10 px-3 text-sm text-white disabled:opacity-50"
                >
                  {!hasStores && (
                    <option value="" className="text-slate-900">
                      Add a store in Setup first
                    </option>
                  )}
                  {(stores ?? []).map((store: any) => (
                    <option key={store.id} value={store.id} className="text-slate-900">
                      {store.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-blue-200">Date</label>
                <Input type="date" name="calendar_date" className="mt-1 border-white/20 bg-white/10 text-white" required />
              </div>
              <div>
                <label className="text-xs text-blue-200">Working day?</label>
                <select name="is_working_day" className="mt-1 h-10 w-full rounded-md border border-white/20 bg-white/10 px-3 text-sm text-white">
                  <option value="true" className="text-slate-900">
                    Yes
                  </option>
                  <option value="false" className="text-slate-900">
                    Closed
                  </option>
                </select>
              </div>
              <Button type="submit" disabled={!hasStores} className="w-full bg-blue-500 hover:bg-blue-500/90">
                Commit changes
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

