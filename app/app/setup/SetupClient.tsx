"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, PlusCircle, Building2, UserMinus, UserCheck } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type StoreRow = { id: string; name: string };
type DeptRow = { id: string; name: string; store_id: string };
type PersonRow = { id: string; name: string; store_id: string; active: boolean };
type SourceRow = { id: string; name: string; store_id: string; active: boolean };
type GoalRow = { department_id: string; year: number; month: number; volume_goal: number };

interface Props {
  stores: StoreRow[];
  departments: DeptRow[];
  salespeople: PersonRow[];
  acquisitionSources: SourceRow[];
  financeManagers: PersonRow[];
  initialGoals: GoalRow[];
  initialYear: number;
  initialMonth: number;
}

// ── Style constants (matches NewDealForm) ─────────────────────────────────────

const SEL =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm " +
  "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const LBL = "text-xs font-medium text-slate-500";

// ── Month names ───────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ── GoalsSection ──────────────────────────────────────────────────────────────

interface GoalsSectionProps {
  stores: StoreRow[];
  departments: DeptRow[];
  initialGoals: GoalRow[];
  initialYear: number;
  initialMonth: number;
}

function GoalsSection({
  stores,
  departments,
  initialGoals,
  initialYear,
  initialMonth,
}: GoalsSectionProps) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [goals, setGoals] = useState<GoalRow[]>(initialGoals);
  const [loadingMonth, setLoadingMonth] = useState(false);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  // Draft values keyed by department_id
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const g of initialGoals) {
      map[g.department_id] = String(g.volume_goal);
    }
    return map;
  });

  async function loadGoals(y: number, m: number) {
    setLoadingMonth(true);
    setBanner(null);
    const supabase = createSupabaseBrowserClient();
    const deptIds = departments.map((d) => d.id);
    if (deptIds.length === 0) {
      setGoals([]);
      setDrafts({});
      setLoadingMonth(false);
      return;
    }
    const { data, error } = await supabase
      .from("department_goals")
      .select("department_id,year,month,volume_goal")
      .in("department_id", deptIds)
      .eq("year", y)
      .eq("month", m);
    if (error) {
      setBanner({ kind: "err", msg: `Failed to load goals: ${error.message}` });
    } else {
      const rows = (data ?? []) as GoalRow[];
      setGoals(rows);
      const map: Record<string, string> = {};
      for (const g of rows) {
        map[g.department_id] = String(g.volume_goal);
      }
      setDrafts(map);
    }
    setLoadingMonth(false);
  }

  function handleYearChange(y: number) {
    setYear(y);
    loadGoals(y, month);
  }

  function handleMonthChange(m: number) {
    setMonth(m);
    loadGoals(year, m);
  }

  async function handleSave() {
    setSaving(true);
    setBanner(null);

    const rows = departments
      .map((d) => {
        const raw = drafts[d.id] ?? "";
        const val = parseInt(raw, 10);
        return { department_id: d.id, year, month, volume_goal: isNaN(val) ? 0 : val };
      })
      .filter((r) => r.volume_goal > 0);

    if (rows.length === 0) {
      setBanner({ kind: "err", msg: "Enter at least one goal before saving." });
      setSaving(false);
      return;
    }

    const prevGoals = goals;
    const prevDrafts = { ...drafts };

    // Optimistic update
    setGoals(rows.map((r) => ({ ...r, year, month })));

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase
      .from("department_goals")
      .upsert(rows, { onConflict: "department_id,year,month" });

    if (error) {
      // Revert
      setGoals(prevGoals);
      setDrafts(prevDrafts);
      setBanner({ kind: "err", msg: `Save failed: ${error.message}` });
    } else {
      setBanner({ kind: "ok", msg: `Goals saved for ${MONTH_NAMES[month - 1]} ${year}.` });
    }
    setSaving(false);
  }

  // Group departments by store for display
  const deptsByStore = new Map<string, DeptRow[]>();
  for (const d of departments) {
    const arr = deptsByStore.get(d.store_id) ?? [];
    arr.push(d);
    deptsByStore.set(d.store_id, arr);
  }

  const currentYear = initialYear;
  const years = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <Card className="app-panel border-[#e7ebf3] shadow-none">
      <CardHeader className="border-[#edf1f7]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-lg">Monthly Department Goals</CardTitle>
          <div className="flex items-center gap-2">
            <select
              value={month}
              onChange={(e) => handleMonthChange(Number(e.target.value))}
              disabled={loadingMonth}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={i + 1} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
            <select
              value={year}
              onChange={(e) => handleYearChange(Number(e.target.value))}
              disabled={loadingMonth}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {banner && (
          <div
            className={`flex items-start gap-3 rounded-xl border p-4 ${
              banner.kind === "ok"
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {banner.kind === "ok" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />}
            <p className="text-sm">{banner.msg}</p>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="ml-auto shrink-0 text-xs underline opacity-60 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        )}

        {departments.length === 0 ? (
          <p className="text-sm text-slate-400">No departments configured yet.</p>
        ) : (
          <div className="space-y-6">
            {stores.map((store) => {
              const depts = deptsByStore.get(store.id) ?? [];
              if (depts.length === 0) return null;
              return (
                <div key={store.id}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {store.name}
                  </p>
                  <div className="space-y-2">
                    {depts.map((dept) => (
                      <div key={dept.id} className="flex min-w-0 flex-wrap items-center gap-3">
                        <label className="min-w-0 flex-1 basis-40 text-sm text-slate-700 sm:flex-none sm:basis-auto sm:w-40 sm:shrink-0">{dept.name}</label>
                        <Input
                          type="number"
                          min={0}
                          placeholder="0"
                          value={drafts[dept.id] ?? ""}
                          onChange={(e) =>
                            setDrafts((prev) => ({ ...prev, [dept.id]: e.target.value }))
                          }
                          className="w-28 shrink-0"
                        />
                        <span className="text-xs text-slate-400">units</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {departments.length > 0 && (
          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={saving || loadingMonth} className="min-w-[120px]">
              {saving ? "Saving…" : "Save Goals"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── RosterSection ─────────────────────────────────────────────────────────────

interface RosterSectionProps {
  title: string;
  table: string;
  stores: StoreRow[];
  initialItems: PersonRow[];
  emptyMessage?: string;
  hasActive?: boolean; // false for acquisition_sources (no active column)
}

function RosterSection({
  title,
  table,
  stores,
  initialItems,
  emptyMessage,
  hasActive = true,
}: RosterSectionProps) {
  const [items, setItems] = useState<PersonRow[]>(initialItems);
  const [addName, setAddName] = useState("");
  const [addStoreId, setAddStoreId] = useState(stores.length === 1 ? stores[0].id : "");
  const [adding, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const storeById = new Map(stores.map((s) => [s.id, s.name]));

  async function handleAdd() {
    const name = addName.trim();
    if (!name || !addStoreId) return;
    setSaving(true);
    setBanner(null);

    const supabase = createSupabaseBrowserClient();
    const insertPayload: Record<string, unknown> = { name, store_id: addStoreId };
    if (hasActive) insertPayload.active = true;

    const { data, error } = await supabase
      .from(table)
      .insert(insertPayload)
      .select("id,name,store_id" + (hasActive ? ",active" : ""))
      .single();

    if (error) {
      setBanner({ kind: "err", msg: `Add failed: ${error.message}` });
    } else {
      const newItem = data as unknown as PersonRow;
      setItems((prev) => [...prev, newItem].sort((a, b) => a.name.localeCompare(b.name)));
      setAddName("");
      if (stores.length > 1) setAddStoreId("");
      setBanner({ kind: "ok", msg: `${name} added to ${storeById.get(addStoreId) ?? "store"}.` });
    }
    setSaving(false);
  }

  async function handleToggleActive(item: PersonRow) {
    if (!hasActive) return;
    const next = !item.active;
    setTogglingId(item.id);
    setBanner(null);

    // Optimistic
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, active: next } : i))
    );

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase
      .from(table)
      .update({ active: next })
      .eq("id", item.id);

    if (error) {
      // Revert
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, active: item.active } : i))
      );
      setBanner({ kind: "err", msg: `Update failed: ${error.message}` });
    } else {
      setBanner({
        kind: "ok",
        msg: `${item.name} ${next ? "reactivated" : "deactivated"}.`,
      });
    }
    setTogglingId(null);
  }

  // Group by store for display
  const byStore = new Map<string, PersonRow[]>();
  for (const item of items) {
    const arr = byStore.get(item.store_id) ?? [];
    arr.push(item);
    byStore.set(item.store_id, arr);
  }

  const activeCount = hasActive ? items.filter((i) => i.active).length : items.length;

  return (
    <Card className="app-panel border-[#e7ebf3] shadow-none">
      <CardHeader className="border-[#edf1f7]">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{title}</CardTitle>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
            {activeCount} active
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {banner && (
          <div
            className={`flex items-start gap-3 rounded-xl border p-3 ${
              banner.kind === "ok"
                ? "border-green-200 bg-green-50 text-green-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {banner.kind === "ok" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />}
            <p className="text-sm">{banner.msg}</p>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="ml-auto shrink-0 text-xs underline opacity-60 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        )}

        {/* Add form */}
        <div className="flex flex-wrap items-end gap-2">
          {stores.length > 1 && (
            <div className="space-y-1">
              <label className={LBL}>Store</label>
              <select
                value={addStoreId}
                onChange={(e) => setAddStoreId(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select store</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="min-w-[200px] flex-1 space-y-1">
            <label className={LBL}>Name</label>
            <Input
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder={`Add ${title.toLowerCase()}…`}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
          </div>
          <Button
            onClick={handleAdd}
            disabled={adding || !addName.trim() || !addStoreId}
            className="shrink-0"
          >
            <PlusCircle className="mr-1.5 h-4 w-4" />
            {adding ? "Adding…" : "Add"}
          </Button>
        </div>

        {/* List */}
        {items.length === 0 ? (
          <p className="text-sm text-slate-400">
            {emptyMessage ?? `No ${title.toLowerCase()} yet. Add one above.`}
          </p>
        ) : (
          <div className="space-y-4">
            {stores.map((store) => {
              const storeItems = byStore.get(store.id) ?? [];
              if (storeItems.length === 0) return null;
              return (
                <div key={store.id}>
                  {stores.length > 1 && (
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {store.name}
                    </p>
                  )}
                  <div className="divide-y divide-[#edf1f7] rounded-xl border border-[#edf1f7]">
                    {storeItems.map((item) => {
                      const isActive = !hasActive || item.active;
                      return (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-3 px-4 py-2.5"
                        >
                          <span
                            className={`text-sm font-medium ${
                              isActive ? "text-slate-800" : "text-slate-400 line-through"
                            }`}
                          >
                            {item.name}
                          </span>
                          {hasActive && (
                            <button
                              type="button"
                              disabled={togglingId === item.id}
                              onClick={() => handleToggleActive(item)}
                              className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                                isActive
                                  ? "text-slate-500 hover:bg-red-50 hover:text-red-600"
                                  : "text-emerald-600 hover:bg-emerald-50"
                              }`}
                            >
                              {isActive ? (
                                <>
                                  <UserMinus className="h-3.5 w-3.5" />
                                  Deactivate
                                </>
                              ) : (
                                <>
                                  <UserCheck className="h-3.5 w-3.5" />
                                  Reactivate
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main SetupClient ──────────────────────────────────────────────────────────

export default function SetupClient({
  stores,
  departments,
  salespeople,
  acquisitionSources,
  financeManagers,
  initialGoals,
  initialYear,
  initialMonth,
}: Props) {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <section className="app-panel p-5">
        <p className="app-kicker">Administration</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Setup & Config</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage stores, monthly goals, salespeople, acquisition sources, and finance managers.
        </p>
      </section>

      {/* Section 1: Stores (read-only) */}
      <Card className="app-panel border-[#e7ebf3] shadow-none">
        <CardHeader className="border-[#edf1f7]">
          <CardTitle className="text-lg">Stores</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {stores.length === 0 ? (
            <p className="text-sm text-slate-400">No stores configured. Contact support to add a store.</p>
          ) : (
            <div className="divide-y divide-[#edf1f7] rounded-xl border border-[#edf1f7]">
              {stores.map((store) => (
                <div key={store.id} className="flex items-center gap-3 px-4 py-3">
                  <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="text-sm font-medium text-slate-800">{store.name}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Monthly Department Goals */}
      <GoalsSection
        stores={stores}
        departments={departments}
        initialGoals={initialGoals}
        initialYear={initialYear}
        initialMonth={initialMonth}
      />

      {/* Section 3: Salespeople */}
      <RosterSection
        title="Salespeople"
        table="salespeople"
        stores={stores}
        initialItems={salespeople}
        hasActive
      />

      {/* Section 4: Acquisition Sources */}
      <RosterSection
        title="Acquisition Sources"
        table="acquisition_sources"
        stores={stores}
        initialItems={acquisitionSources}
      />

      {/* Section 5: Finance Managers */}
      <RosterSection
        title="Finance Managers"
        table="finance_managers"
        stores={stores}
        initialItems={financeManagers}
        emptyMessage="No finance managers yet. Add one above to enable F&I tracking on deals."
        hasActive
      />
    </div>
  );
}
