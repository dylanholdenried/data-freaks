"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isRolledUpDepartment } from "@/lib/departments/rollup";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, PlusCircle, UserMinus, UserCheck } from "lucide-react";
import { updateOnboardingChecklist } from "@/app/app/onboarding-actions";
import { createAcquireBuyer, toggleAcquireBuyer } from "./acquire-buyer-actions";
import DepartmentsSection from "./DepartmentsSection";
import type { ManagedDepartment } from "./department-actions";

// ── Types ─────────────────────────────────────────────────────────────────────

type StoreRow = { id: string; name: string };
type DeptRow = ManagedDepartment;
type PersonRow = { id: string; name: string; store_id: string; active: boolean };
type SourceRow = { id: string; name: string; store_id: string; active: boolean };
type SourceDepartmentLink = {
  acquisition_source_id: string;
  department_id: string;
};
type GoalRow = { department_id: string; year: number; month: number; volume_goal: number };

interface Props {
  stores: StoreRow[];
  departments: DeptRow[];
  salespeople: PersonRow[];
  acquisitionSources: SourceRow[];
  acquisitionSourceDepartments: SourceDepartmentLink[];
  financeManagers: PersonRow[];
  acquireBuyers: { id: string; name: string; active: boolean }[];
  dealerGroupId: string;
  initialGoals: GoalRow[];
  initialYear: number;
  initialMonth: number;
  onboardingChecklist?: {
    salespeople?: boolean;
    finance_managers?: boolean;
    acquisition_sources?: boolean;
    goals?: boolean;
  };
  showOnboardingChecklist?: boolean;
  /** Impersonation / store_viewer — browse only, no writes. */
  readOnly?: boolean;
  /** Platform / owner admins only. */
  canManageDepartments?: boolean;
}

// ── Style constants (matches NewDealForm) ─────────────────────────────────────

const SEL =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm " +
  "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const LBL = "text-xs font-medium text-muted-foreground";

// ── Month names ───────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ── GoalsSection ──────────────────────────────────────────────────────────────

interface GoalsSectionProps {
  stores: StoreRow[];
  selectedStoreId: string;
  departments: DeptRow[];
  initialGoals: GoalRow[];
  initialYear: number;
  initialMonth: number;
  readOnly?: boolean;
}

function GoalsSection({
  stores,
  selectedStoreId,
  departments,
  initialGoals,
  initialYear,
  initialMonth,
  readOnly = false,
}: GoalsSectionProps) {
  const goalDepartments = useMemo(
    () => departments.filter((d) => !isRolledUpDepartment(d) && d.is_active),
    [departments]
  );
  const visibleGoalDepartments = useMemo(
    () => goalDepartments.filter((dept) => dept.store_id === selectedStoreId),
    [goalDepartments, selectedStoreId]
  );
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

  async function loadGoals(y: number, m: number, storeId: string) {
    setLoadingMonth(true);
    setBanner(null);
    const deptIds = goalDepartments
      .filter((dept) => dept.store_id === storeId)
      .map((dept) => dept.id);
    const deptIdSet = new Set(deptIds);
    if (deptIds.length === 0) {
      setGoals((prev) => prev.filter((goal) => !deptIdSet.has(goal.department_id)));
      setDrafts((prev) => {
        const next = { ...prev };
        for (const id of deptIds) delete next[id];
        return next;
      });
      setLoadingMonth(false);
      return;
    }
    const supabase = createSupabaseBrowserClient();
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
      setGoals((prev) => [
        ...prev.filter(
          (goal) =>
            !(goal.year === y && goal.month === m && deptIdSet.has(goal.department_id))
        ),
        ...rows,
      ]);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const id of deptIds) delete next[id];
        for (const goal of rows) next[goal.department_id] = String(goal.volume_goal);
        return next;
      });
    }
    setLoadingMonth(false);
  }

  const skipInitialGoalLoad = useRef(true);
  useEffect(() => {
    if (skipInitialGoalLoad.current) {
      skipInitialGoalLoad.current = false;
      return;
    }
    if (!selectedStoreId) return;
    void loadGoals(year, month, selectedStoreId);
    // Reload only when the visible store or period changes. Initial data is already loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStoreId, year, month]);

  function handleYearChange(y: number) {
    setYear(y);
  }

  function handleMonthChange(m: number) {
    setMonth(m);
  }

  async function handleSave() {
    if (readOnly) {
      setBanner({ kind: "err", msg: "View only — changes are not allowed." });
      return;
    }
    setSaving(true);
    setBanner(null);

    const rows = goalDepartments
      .filter((d) => d.store_id === selectedStoreId)
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

  // Group parent departments by store (rolled-up fleet desks share the parent goal)
  const deptsByStore = new Map<string, DeptRow[]>();
  for (const d of goalDepartments) {
    const arr = deptsByStore.get(d.store_id) ?? [];
    arr.push(d);
    deptsByStore.set(d.store_id, arr);
  }

  const nowYear = new Date().getFullYear();
  const years = Array.from(
    new Set([nowYear - 1, nowYear, nowYear + 1, initialYear, year])
  ).sort((a, b) => a - b);

  return (
    <Card id="goals" className="app-panel scroll-mt-24 border-border shadow-none">
      <CardHeader className="border-border">
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
                : "border-[color-mix(in_srgb,var(--da-red)_35%,transparent)] bg-[color-mix(in_srgb,var(--da-red)_12%,transparent)] text-[var(--da-red)]"
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

        {visibleGoalDepartments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No departments configured yet.</p>
        ) : (
          <div className="space-y-6">
            {stores
              .filter((store) => store.id === selectedStoreId)
              .map((store) => {
              const depts = deptsByStore.get(store.id) ?? [];
              if (depts.length === 0) return null;
              return (
                <div key={store.id}>
                  <div className="space-y-2">
                    {depts.map((dept) => (
                      <div key={dept.id} className="flex min-w-0 flex-wrap items-center gap-3">
                        <label className="min-w-0 flex-1 basis-40 text-sm text-foreground sm:flex-none sm:basis-auto sm:w-40 sm:shrink-0">
                          {dept.name}
                          {departments.some(
                            (d) => d.rolls_up_to_department_id === dept.id && d.is_active
                          ) ? (
                            <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                              includes fleet
                            </span>
                          ) : null}
                        </label>
                        <Input
                          type="number"
                          min={0}
                          placeholder="0"
                          value={drafts[dept.id] ?? ""}
                          onChange={(e) =>
                            setDrafts((prev) => ({ ...prev, [dept.id]: e.target.value }))
                          }
                          disabled={readOnly}
                          readOnly={readOnly}
                          className="w-28 shrink-0"
                        />
                        <span className="text-xs text-muted-foreground">units</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {visibleGoalDepartments.length > 0 && !readOnly ? (
          <div className="flex justify-end pt-2">
            <Button onClick={handleSave} disabled={saving || loadingMonth} className="min-w-[120px]">
              {saving ? "Saving…" : "Save Goals"}
            </Button>
          </div>
        ) : null}
        {visibleGoalDepartments.length > 0 && readOnly ? (
          <p className="pt-2 text-xs text-muted-foreground">View only — goals cannot be changed.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ── AcquisitionSourcesSection ─────────────────────────────────────────────────

interface AcquisitionSourcesSectionProps {
  stores: StoreRow[];
  selectedStoreId: string;
  departments: DeptRow[];
  initialSources: SourceRow[];
  initialLinks: SourceDepartmentLink[];
  readOnly?: boolean;
}

function AcquisitionSourcesSection({
  stores,
  selectedStoreId,
  departments,
  initialSources,
  initialLinks,
  readOnly = false,
}: AcquisitionSourcesSectionProps) {
  const [sources, setSources] = useState<SourceRow[]>(initialSources);
  const [links, setLinks] = useState<SourceDepartmentLink[]>(initialLinks);
  const [addName, setAddName] = useState("");
  const [addStoreId, setAddStoreId] = useState(selectedStoreId);
  const [addDepartmentId, setAddDepartmentId] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setAddStoreId(selectedStoreId);
    setAddDepartmentId("");
  }, [selectedStoreId]);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const deptById = new Map(departments.map((d) => [d.id, d]));
  const goalDepartments = useMemo(
    () => departments.filter((d) => !isRolledUpDepartment(d)),
    [departments]
  );
  const departmentsForStore = addStoreId
    ? goalDepartments.filter((d) => d.store_id === addStoreId && d.is_active)
    : [];

  async function handleAdd() {
    if (readOnly) {
      setBanner({ kind: "err", msg: "View only — changes are not allowed." });
      return;
    }
    const name = addName.trim();
    if (!name || !addStoreId || !addDepartmentId) return;
    const department = departmentsForStore.find((d) => d.id === addDepartmentId);
    if (
      addStoreId !== selectedStoreId ||
      !stores.some((store) => store.id === addStoreId) ||
      !department
    ) {
      setBanner({ kind: "err", msg: "Choose a department for this store." });
      return;
    }
    setAdding(true);
    setBanner(null);

    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("acquisition_sources")
      .insert({ name, store_id: addStoreId, active: true })
      .select("id,name,store_id,active")
      .single();

    if (error) {
      setBanner({ kind: "err", msg: `Add failed: ${error.message}` });
      setAdding(false);
      return;
    }

    const newSource = data as unknown as SourceRow;
    const { error: linkError } = await supabase
      .from("acquisition_source_departments")
      .insert({
        acquisition_source_id: newSource.id,
        department_id: addDepartmentId,
      });

    if (linkError) {
      setBanner({ kind: "err", msg: `Source created but department link failed: ${linkError.message}` });
      setAdding(false);
      return;
    }

    setSources((prev) => [...prev, newSource].sort((a, b) => a.name.localeCompare(b.name)));
    setLinks((prev) => [
      ...prev,
      { acquisition_source_id: newSource.id, department_id: addDepartmentId },
    ]);
    setAddName("");
    setAddDepartmentId("");
    setBanner({
      kind: "ok",
      msg: `${name} added to ${deptById.get(addDepartmentId)?.name ?? "department"}.`,
    });
    setAdding(false);
  }

  async function handleToggleActive(item: SourceRow) {
    if (readOnly) return;
    const next = !item.active;
    setTogglingId(item.id);
    setBanner(null);
    setSources((prev) => prev.map((i) => (i.id === item.id ? { ...i, active: next } : i)));

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase
      .from("acquisition_sources")
      .update({ active: next })
      .eq("id", item.id);

    if (error) {
      setSources((prev) =>
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

  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const visibleSources = sources.filter((source) => source.store_id === selectedStoreId);
  const activeCount = visibleSources.filter((source) => source.active).length;

  return (
    <Card className="app-panel border-border shadow-none">
      <CardHeader className="border-border">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Acquisition Sources</CardTitle>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
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
                : "border-[color-mix(in_srgb,var(--da-red)_35%,transparent)] bg-[color-mix(in_srgb,var(--da-red)_12%,transparent)] text-[var(--da-red)]"
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

        {!readOnly ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label className={LBL}>Department</label>
              <select
                value={addDepartmentId}
                onChange={(e) => setAddDepartmentId(e.target.value)}
                className={SEL}
                disabled={!addStoreId}
              >
                <option value="">Select department</option>
                {departmentsForStore.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[200px] flex-1 space-y-1">
              <label className={LBL}>Name</label>
              <Input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="Add acquisition source…"
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
            </div>
            <Button
              onClick={handleAdd}
              disabled={adding || !addName.trim() || !addStoreId || !addDepartmentId}
              className="shrink-0"
            >
              <PlusCircle className="mr-1.5 h-4 w-4" />
              {adding ? "Adding…" : "Add"}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">View only — sources cannot be changed.</p>
        )}

        {visibleSources.length === 0 ? (
          <p className="text-sm text-muted-foreground">No acquisition sources yet. Add one above.</p>
        ) : (
          <div className="space-y-4">
            {stores
              .filter((store) => store.id === selectedStoreId)
              .map((store) => {
              const storeDepts = goalDepartments.filter((d) => d.store_id === store.id);
              if (storeDepts.length === 0) return null;
              return (
                <div key={store.id}>
                  <div className="space-y-3">
                    {storeDepts.map((dept) => {
                      const deptLinks = links.filter((l) => l.department_id === dept.id);
                      if (deptLinks.length === 0) return null;
                      return (
                        <div key={dept.id}>
                          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                            {dept.name}
                            {!dept.is_active ? " (inactive)" : ""}
                          </p>
                          <div className="divide-y divide-border rounded-xl border border-border">
                            {deptLinks.map((link) => {
                              const item = sourceById.get(link.acquisition_source_id);
                              if (!item) return null;
                              return (
                                <div
                                  key={`${dept.id}-${item.id}`}
                                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                                >
                                  <span
                                    className={`text-sm font-medium ${
                                      item.active ? "text-foreground" : "text-muted-foreground line-through"
                                    }`}
                                  >
                                    {item.name}
                                  </span>
                                  {!readOnly && (
                                    <button
                                      type="button"
                                      disabled={togglingId === item.id}
                                      onClick={() => handleToggleActive(item)}
                                      className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                                        item.active
                                          ? "text-muted-foreground hover:bg-[color-mix(in_srgb,var(--da-red)_12%,transparent)] hover:text-red-600"
                                          : "text-emerald-600 hover:bg-[color-mix(in_srgb,var(--da-green)_12%,transparent)]"
                                      }`}
                                    >
                                      {item.active ? (
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
                </div>
              );
            })}
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
  selectedStoreId: string;
  initialItems: PersonRow[];
  emptyMessage?: string;
  hasActive?: boolean; // false for acquisition_sources (no active column)
  readOnly?: boolean;
}

function RosterSection({
  title,
  table,
  stores,
  selectedStoreId,
  initialItems,
  emptyMessage,
  hasActive = true,
  readOnly = false,
}: RosterSectionProps) {
  const [items, setItems] = useState<PersonRow[]>(initialItems);
  const [addName, setAddName] = useState("");
  const [addStoreId, setAddStoreId] = useState(selectedStoreId);
  const [adding, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  useEffect(() => {
    setAddStoreId(selectedStoreId);
  }, [selectedStoreId]);

  const storeById = new Map(stores.map((s) => [s.id, s.name]));

  async function handleAdd() {
    if (readOnly) {
      setBanner({ kind: "err", msg: "View only — changes are not allowed." });
      return;
    }
    const name = addName.trim();
    if (!name || !addStoreId) return;
    if (addStoreId !== selectedStoreId || !stores.some((store) => store.id === addStoreId)) {
      setBanner({ kind: "err", msg: "That store is not available." });
      return;
    }
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
      setBanner({ kind: "ok", msg: `${name} added to ${storeById.get(addStoreId) ?? "store"}.` });
    }
    setSaving(false);
  }

  async function handleToggleActive(item: PersonRow) {
    if (readOnly || !hasActive) return;
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

  const visibleItems = items.filter((item) => item.store_id === selectedStoreId);
  const activeCount = hasActive
    ? visibleItems.filter((item) => item.active).length
    : visibleItems.length;

  return (
    <Card className="app-panel border-border shadow-none">
      <CardHeader className="border-border">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{title}</CardTitle>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
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
                : "border-[color-mix(in_srgb,var(--da-red)_35%,transparent)] bg-[color-mix(in_srgb,var(--da-red)_12%,transparent)] text-[var(--da-red)]"
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
        {!readOnly ? (
        <div className="flex flex-wrap items-end gap-2">
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
        ) : (
          <p className="text-xs text-muted-foreground">View only — roster cannot be changed.</p>
        )}

        {/* List */}
        {visibleItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {emptyMessage ?? `No ${title.toLowerCase()} yet. Add one above.`}
          </p>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border">
            {visibleItems.map((item) => {
              const isActive = !hasActive || item.active;
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <span
                    className={`text-sm font-medium ${
                      isActive ? "text-foreground" : "text-muted-foreground line-through"
                    }`}
                  >
                    {item.name}
                  </span>
                  {hasActive && !readOnly && (
                    <button
                      type="button"
                      disabled={togglingId === item.id}
                      onClick={() => handleToggleActive(item)}
                      className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                        isActive
                          ? "text-muted-foreground hover:bg-[color-mix(in_srgb,var(--da-red)_12%,transparent)] hover:text-red-600"
                          : "text-emerald-600 hover:bg-[color-mix(in_srgb,var(--da-green)_12%,transparent)]"
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
                  {hasActive && readOnly && !isActive ? (
                    <span className="text-xs text-muted-foreground">Inactive</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Acquire buyers (group-scoped) ─────────────────────────────────────────────

function AcquireBuyersSection({
  dealerGroupId,
  initialBuyers,
  readOnly = false,
}: {
  dealerGroupId: string;
  initialBuyers: { id: string; name: string; active: boolean }[];
  readOnly?: boolean;
}) {
  const [items, setItems] = useState(initialBuyers);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  async function handleAdd() {
    if (readOnly) return;
    const n = name.trim();
    if (!n || !dealerGroupId) {
      setBanner({
        kind: "err",
        msg: !dealerGroupId ? "Select an auto group before adding buyers." : "Enter a buyer name.",
      });
      return;
    }
    setSaving(true);
    setBanner(null);
    const res = await createAcquireBuyer(n);
    setSaving(false);
    if (!res.ok) {
      setBanner({ kind: "err", msg: res.error });
      return;
    }
    setItems((prev) => {
      if (prev.some((b) => b.id === res.buyer.id)) return prev;
      return [...prev, res.buyer].sort((a, b) => a.name.localeCompare(b.name));
    });
    setName("");
    setBanner({ kind: "ok", msg: "Buyer added — it will show in Acquire → Log purchase." });
  }

  async function handleToggle(id: string, active: boolean) {
    if (readOnly) return;
    const res = await toggleAcquireBuyer(id, active);
    if (!res.ok) {
      setBanner({ kind: "err", msg: res.error });
      return;
    }
    setItems((prev) => prev.map((b) => (b.id === id ? { ...b, active: !active } : b)));
  }

  return (
    <Card className="app-panel border-border shadow-none">
      <CardHeader className="border-border">
        <CardTitle className="text-lg">Acquire Buyers</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <p className="text-sm text-muted-foreground">
          Names shown on Acquire purchase cards (who bought the car). Group-wide list.
        </p>
        {!readOnly ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-[200px] flex-1">
              <span className={LBL}>Buyer name</span>
              <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dylan" />
            </label>
            <Button type="button" size="sm" disabled={saving || !name.trim()} onClick={() => void handleAdd()}>
              <PlusCircle className="mr-1 h-3.5 w-3.5" />
              {saving ? "Saving…" : "Add"}
            </Button>
          </div>
        ) : null}
        {banner ? (
          <p className={`text-sm font-medium ${banner.kind === "ok" ? "text-emerald-600" : "text-destructive"}`}>
            {banner.msg}
          </p>
        ) : null}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No buyers yet. Add buyers to use the Buyer dropdown in Acquire.</p>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border">
            {items.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className={`text-sm font-medium ${b.active ? "text-foreground" : "text-muted-foreground line-through"}`}>
                  {b.name}
                </span>
                {!readOnly ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => void handleToggle(b.id, b.active)}>
                    {b.active ? <UserMinus className="mr-1 h-3.5 w-3.5" /> : <UserCheck className="mr-1 h-3.5 w-3.5" />}
                    {b.active ? "Deactivate" : "Activate"}
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StorePills({
  stores,
  selectedId,
  onSelect,
}: {
  stores: StoreRow[];
  selectedId: string;
  onSelect: (storeId: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Stores">
      {stores.map((store) => {
        const active = store.id === selectedId;
        return (
          <button
            key={store.id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(store.id)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              active
                ? "bg-[var(--da-blue)] text-white"
                : "bg-muted text-muted-foreground hover:bg-[var(--da-line)]"
            }`}
          >
            {store.name}
          </button>
        );
      })}
    </div>
  );
}

// ── Main SetupClient ──────────────────────────────────────────────────────────

export default function SetupClient({
  stores,
  departments,
  salespeople,
  acquisitionSources,
  acquisitionSourceDepartments,
  financeManagers,
  acquireBuyers,
  dealerGroupId,
  initialGoals,
  initialYear,
  initialMonth,
  onboardingChecklist = {},
  showOnboardingChecklist = false,
  readOnly = false,
  canManageDepartments = false,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [departmentRows, setDepartmentRows] = useState<DeptRow[]>(departments);

  function handleDepartmentSaved(saved: DeptRow) {
    setDepartmentRows((prev) => {
      const next = prev.some((d) => d.id === saved.id)
        ? prev.map((d) => (d.id === saved.id ? saved : d))
        : [...prev, saved];
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
  }
  // Selection is limited to stores the server already authorized for this user.
  const [selectedStoreId, setSelectedStoreId] = useState(() => stores[0]?.id ?? "");
  const selectedStore = useMemo(
    () => stores.find((store) => store.id === selectedStoreId) ?? stores[0] ?? null,
    [stores, selectedStoreId]
  );
  const inferred = useMemo(
    () => ({
      salespeople: salespeople.some((s) => s.active !== false) || Boolean(onboardingChecklist.salespeople),
      finance_managers:
        financeManagers.some((s) => s.active !== false) || Boolean(onboardingChecklist.finance_managers),
      acquisition_sources:
        acquisitionSources.length > 0 || Boolean(onboardingChecklist.acquisition_sources),
      goals: initialGoals.length > 0 || Boolean(onboardingChecklist.goals),
    }),
    [salespeople, financeManagers, acquisitionSources, initialGoals, onboardingChecklist]
  );

  const checklistItems = [
    { key: "salespeople" as const, label: "Add salespeople" },
    { key: "finance_managers" as const, label: "Add finance managers" },
    { key: "acquisition_sources" as const, label: "Add acquisition sources" },
    { key: "goals" as const, label: "Set monthly department goals" },
  ];

  const allDone = checklistItems.every((item) => inferred[item.key]);

  function markDone(key: (typeof checklistItems)[number]["key"]) {
    if (readOnly) return;
    startTransition(async () => {
      await updateOnboardingChecklist({ [key]: true });
    });
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <section className="app-panel p-5">
        <p className="app-kicker">Administration</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Setup & Config</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {readOnly
            ? "Select a store to browse its departments, goals, and roster. Changes are disabled in this session."
            : canManageDepartments
              ? "Select a store to manage its departments, goals, salespeople, acquisition sources, and finance managers."
              : "Select a store to manage its goals, salespeople, acquisition sources, and finance managers."}
        </p>
        {stores.length > 0 && selectedStore ? (
          <div className="mt-4">
            <StorePills
              stores={stores}
              selectedId={selectedStore.id}
              onSelect={setSelectedStoreId}
            />
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            No stores configured. Contact support to add a store.
          </p>
        )}
      </section>

      {showOnboardingChecklist && !allDone && !readOnly ? (
        <Card className="border-[color-mix(in_srgb,var(--da-blue)_35%,transparent)] bg-[color-mix(in_srgb,var(--da-blue)_10%,transparent)] shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-foreground">Finish group setup</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {checklistItems.map((item) => {
              const done = inferred[item.key];
              return (
                <div
                  key={item.key}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[color-mix(in_srgb,var(--da-blue)_25%,transparent)] bg-card px-3 py-2"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2
                      className={`h-4 w-4 ${done ? "text-emerald-500" : "text-muted-foreground"}`}
                    />
                    <span className={done ? "text-muted-foreground line-through" : "text-foreground"}>
                      {item.label}
                    </span>
                  </div>
                  {!done ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => markDone(item.key)}
                    >
                      Mark done
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {selectedStore ? (
        <DepartmentsSection
          selectedStoreId={selectedStore.id}
          departments={departmentRows}
          canManage={canManageDepartments}
          onSaved={handleDepartmentSaved}
        />
      ) : null}

      <GoalsSection
        stores={stores}
        selectedStoreId={selectedStore?.id ?? ""}
        departments={departmentRows}
        initialGoals={initialGoals}
        initialYear={initialYear}
        initialMonth={initialMonth}
        readOnly={readOnly}
      />

      <RosterSection
        title="Salespeople"
        table="salespeople"
        stores={stores}
        selectedStoreId={selectedStore?.id ?? ""}
        initialItems={salespeople}
        hasActive
        readOnly={readOnly}
      />

      <AcquisitionSourcesSection
        stores={stores}
        selectedStoreId={selectedStore?.id ?? ""}
        departments={departmentRows}
        initialSources={acquisitionSources}
        initialLinks={acquisitionSourceDepartments}
        readOnly={readOnly}
      />

      <RosterSection
        title="Finance Managers"
        table="finance_managers"
        stores={stores}
        selectedStoreId={selectedStore?.id ?? ""}
        initialItems={financeManagers}
        emptyMessage="No finance managers yet. Add one above to enable F&I tracking on deals."
        hasActive
        readOnly={readOnly}
      />

      {/* Section 6: Acquire Buyers */}
      <AcquireBuyersSection
        dealerGroupId={dealerGroupId}
        initialBuyers={acquireBuyers}
        readOnly={readOnly}
      />
    </div>
  );
}
