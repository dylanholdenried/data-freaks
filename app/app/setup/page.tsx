import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createDepartment, createSalesperson, createSource, createStore } from "@/app/app/actions";

export default async function SetupPage() {
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
  const [{ data: departments }, { data: salespeople }, { data: sources }] = await Promise.all([
    supabase.from("departments").select("id,store_id"),
    supabase.from("salespeople").select("id,store_id"),
    supabase.from("acquisition_sources").select("id,store_id")
  ]);

  const deptCount = (departments ?? []).filter((d: any) => storeIds.includes(d.store_id)).length;
  const spCount = (salespeople ?? []).filter((s: any) => storeIds.includes(s.store_id)).length;
  const sourceCount = (sources ?? []).filter((s: any) => storeIds.includes(s.store_id)).length;

  return (
    <div className="space-y-6">
      <section className="app-panel p-5">
        <p className="app-kicker">Onboarding Checklist</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Group Setup Control Center</h1>
        <p className="mt-1 text-sm text-slate-500">Configure stores, departments, salespeople roster, and acquisition sources.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <Card className="app-panel border-[#e7ebf3] shadow-none"><CardContent className="p-4"><p className="app-kicker">Stores</p><p className="mt-1 text-3xl font-semibold">{stores?.length ?? 0}</p></CardContent></Card>
        <Card className="app-panel border-[#e7ebf3] shadow-none"><CardContent className="p-4"><p className="app-kicker">Departments</p><p className="mt-1 text-3xl font-semibold">{deptCount}</p></CardContent></Card>
        <Card className="app-panel border-[#e7ebf3] shadow-none"><CardContent className="p-4"><p className="app-kicker">Salespeople</p><p className="mt-1 text-3xl font-semibold">{spCount}</p></CardContent></Card>
        <Card className="app-panel border-[#e7ebf3] shadow-none"><CardContent className="p-4"><p className="app-kicker">Sources</p><p className="mt-1 text-3xl font-semibold">{sourceCount}</p></CardContent></Card>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="app-panel border-[#e7ebf3] shadow-none">
          <CardHeader className="border-[#edf1f7]"><CardTitle>Add store</CardTitle></CardHeader>
          <CardContent>
            <form action={createStore} className="grid gap-3 md:grid-cols-3">
              <Input name="store_name" placeholder="Store name" required />
              <Input name="store_code" placeholder="Code (optional)" />
              <Button type="submit">Create store</Button>
            </form>
          </CardContent>
        </Card>

        <Card className="app-panel border-[#e7ebf3] shadow-none">
          <CardHeader className="border-[#edf1f7]"><CardTitle>Add department</CardTitle></CardHeader>
          <CardContent>
            <form action={createDepartment} className="grid gap-3 md:grid-cols-3">
              <select name="store_id" className="h-10 rounded-md border border-input bg-white px-3 text-sm" required>
                <option value="">Select store</option>
                {(stores ?? []).map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <Input name="department_name" placeholder="Department name" required />
              <Button type="submit">Add department</Button>
            </form>
          </CardContent>
        </Card>

        <Card className="app-panel border-[#e7ebf3] shadow-none">
          <CardHeader className="border-[#edf1f7]"><CardTitle>Add salesperson</CardTitle></CardHeader>
          <CardContent>
            <form action={createSalesperson} className="grid gap-3 md:grid-cols-4">
              <select name="store_id" className="h-10 rounded-md border border-input bg-white px-3 text-sm" required>
                <option value="">Store</option>
                {(stores ?? []).map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <Input name="first_name" placeholder="First name" required />
              <Input name="last_name" placeholder="Last name" required />
              <Button type="submit">Add rep</Button>
            </form>
          </CardContent>
        </Card>

        <Card className="app-panel border-[#e7ebf3] shadow-none">
          <CardHeader className="border-[#edf1f7]"><CardTitle>Add acquisition source</CardTitle></CardHeader>
          <CardContent>
            <form action={createSource} className="grid gap-3 md:grid-cols-3">
              <select name="store_id" className="h-10 rounded-md border border-input bg-white px-3 text-sm" required>
                <option value="">Select store</option>
                {(stores ?? []).map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <Input name="source_name" placeholder="Source name" required />
              <Button type="submit">Add source</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

