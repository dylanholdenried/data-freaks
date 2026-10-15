"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Pencil, PlusCircle, UserCheck, UserMinus } from "lucide-react";
import { isPreOwnedDepartment } from "@/lib/buy-box/sale-books";
import { isFiDepartment } from "@/lib/dashboard/pace";
import { DEPARTMENT_NAME_MAX, renameBehaviorChange } from "@/lib/departments/name-rules";
import {
  createDepartment,
  setDepartmentActive,
  updateDepartment,
  type ManagedDepartment,
} from "./department-actions";

const SEL =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm " +
  "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const LBL = "text-xs font-medium text-muted-foreground";

const TAG = "rounded-full px-2 py-0.5 text-[11px] font-semibold";

type Banner = { kind: "ok" | "err"; msg: string } | null;

interface Props {
  selectedStoreId: string;
  departments: ManagedDepartment[];
  canManage: boolean;
  onSaved: (department: ManagedDepartment) => void;
}

export default function DepartmentsSection({
  selectedStoreId,
  departments,
  canManage,
  onSaved,
}: Props) {
  const [banner, setBanner] = useState<Banner>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addName, setAddName] = useState("");
  const [addParentId, setAddParentId] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editParentId, setEditParentId] = useState("");

  useEffect(() => {
    setBanner(null);
    setAddName("");
    setAddParentId("");
    setEditingId(null);
  }, [selectedStoreId]);

  const storeDepts = useMemo(
    () =>
      departments
        .filter((d) => d.store_id === selectedStoreId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [departments, selectedStoreId]
  );
  const deptById = useMemo(() => new Map(storeDepts.map((d) => [d.id, d])), [storeDepts]);

  const parentOptions = (selfId: string | null) =>
    storeDepts.filter((d) => d.id !== selfId && d.is_active && !d.rolls_up_to_department_id);

  const hasChildren = (id: string) => storeDepts.some((d) => d.rolls_up_to_department_id === id);

  async function handleAdd() {
    if (!canManage) return;
    setAdding(true);
    setBanner(null);
    const res = await createDepartment({
      storeId: selectedStoreId,
      name: addName,
      rollsUpToDepartmentId: addParentId || null,
    });
    setAdding(false);
    if (!res.ok) {
      setBanner({ kind: "err", msg: res.error });
      return;
    }
    onSaved(res.department);
    setAddName("");
    setAddParentId("");
    setBanner({ kind: "ok", msg: `${res.department.name} added.` });
  }

  function startEdit(dept: ManagedDepartment) {
    setBanner(null);
    setEditingId(dept.id);
    setEditName(dept.name);
    setEditParentId(dept.rolls_up_to_department_id ?? "");
  }

  async function handleSaveEdit(dept: ManagedDepartment) {
    if (!canManage) return;
    setBusyId(dept.id);
    setBanner(null);
    const res = await updateDepartment({
      departmentId: dept.id,
      name: editName,
      rollsUpToDepartmentId: editParentId || null,
    });
    setBusyId(null);
    if (!res.ok) {
      setBanner({ kind: "err", msg: res.error });
      return;
    }
    onSaved(res.department);
    setEditingId(null);
    setBanner({ kind: "ok", msg: `${res.department.name} saved.` });
  }

  async function handleToggleActive(dept: ManagedDepartment) {
    if (!canManage) return;
    setBusyId(dept.id);
    setBanner(null);
    const res = await setDepartmentActive({ departmentId: dept.id, active: !dept.is_active });
    setBusyId(null);
    if (!res.ok) {
      setBanner({ kind: "err", msg: res.error });
      return;
    }
    onSaved(res.department);
    setBanner({
      kind: "ok",
      msg: res.department.is_active
        ? `${res.department.name} reactivated.`
        : `${res.department.name} deactivated. Existing deals and history are unchanged.`,
    });
  }

  const activeCount = storeDepts.filter((d) => d.is_active).length;

  return (
    <Card className="app-panel border-border shadow-none">
      <CardHeader className="border-border">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Departments</CardTitle>
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

        {canManage ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[200px] flex-1 space-y-1">
                <label className={LBL}>Name</label>
                <Input
                  value={addName}
                  maxLength={DEPARTMENT_NAME_MAX}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="Add department…"
                  onKeyDown={(e) => e.key === "Enter" && addName.trim() && handleAdd()}
                />
              </div>
              <div className="min-w-[180px] space-y-1">
                <label className={LBL}>Rolls up to (optional)</label>
                <select
                  value={addParentId}
                  onChange={(e) => setAddParentId(e.target.value)}
                  className={SEL}
                >
                  <option value="">No rollup</option>
                  {parentOptions(null).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button onClick={handleAdd} disabled={adding || !addName.trim()} className="shrink-0">
                <PlusCircle className="mr-1.5 h-4 w-4" />
                {adding ? "Adding…" : "Add"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              A rollup counts this department&apos;s deals toward the parent&apos;s dashboard card and
              goal (for example, a Fleet desk under New). Departments can be deactivated but never
              deleted, so past deals keep their department.
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Only platform and owner admins can add or change departments.
          </p>
        )}

        {storeDepts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No departments configured for this store.</p>
        ) : (
          <div className="divide-y divide-border rounded-xl border border-border">
            {storeDepts.map((dept) => {
              const parent = dept.rolls_up_to_department_id
                ? deptById.get(dept.rolls_up_to_department_id)
                : null;
              const busy = busyId === dept.id;

              if (editingId === dept.id && canManage) {
                const renameIssue =
                  editName.trim() && editName.trim() !== dept.name
                    ? renameBehaviorChange(dept.name, editName)
                    : null;
                const rollupChanged = (dept.rolls_up_to_department_id ?? "") !== editParentId;
                const nameChanged = editName.trim() !== dept.name;
                return (
                  <div key={dept.id} className="space-y-2 px-4 py-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-[200px] flex-1 space-y-1">
                        <label className={LBL}>Name</label>
                        <Input
                          value={editName}
                          maxLength={DEPARTMENT_NAME_MAX}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                      </div>
                      <div className="min-w-[180px] space-y-1">
                        <label className={LBL}>Rolls up to</label>
                        <select
                          value={editParentId}
                          onChange={(e) => setEditParentId(e.target.value)}
                          className={SEL}
                          disabled={hasChildren(dept.id)}
                        >
                          <option value="">No rollup</option>
                          {parentOptions(dept.id).map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleSaveEdit(dept)}
                          disabled={busy || !editName.trim() || Boolean(renameIssue)}
                        >
                          {busy ? "Saving…" : "Save"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingId(null)}
                          disabled={busy}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                    {hasChildren(dept.id) ? (
                      <p className="text-xs text-muted-foreground">
                        Other departments roll up to this one, so it can&apos;t roll up itself.
                      </p>
                    ) : null}
                    {renameIssue ? (
                      <p className="text-xs font-medium text-[var(--da-red)]">{renameIssue}</p>
                    ) : null}
                    {nameChanged && !renameIssue ? (
                      <p className="text-xs text-amber-700">
                        Past deals will show the new name. CSV deal imports must use the new name.
                      </p>
                    ) : null}
                    {rollupChanged ? (
                      <p className="text-xs text-amber-700">
                        Changing the rollup regroups past months on dashboard cards, the calendar, and
                        goals. Deal records themselves are not changed.
                      </p>
                    ) : null}
                  </div>
                );
              }

              return (
                <div key={dept.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span
                      className={`text-sm font-medium ${
                        dept.is_active ? "text-foreground" : "text-muted-foreground line-through"
                      }`}
                    >
                      {dept.name}
                    </span>
                    {!dept.is_active ? (
                      <span className={`${TAG} bg-muted text-muted-foreground`}>Inactive</span>
                    ) : null}
                    {parent ? (
                      <span className={`${TAG} bg-[color-mix(in_srgb,var(--da-blue)_12%,transparent)] text-[var(--da-blue)]`}>
                        Rolls up to {parent.name}
                      </span>
                    ) : null}
                    {isPreOwnedDepartment(dept.name) ? (
                      <span className={`${TAG} bg-muted text-muted-foreground`}>Pre-Owned</span>
                    ) : null}
                    {isFiDepartment(dept.name) ? (
                      <span className={`${TAG} bg-muted text-muted-foreground`}>F&amp;I</span>
                    ) : null}
                  </div>
                  {canManage ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={busy || editingId !== null}
                        onClick={() => startEdit(dept)}
                        className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleToggleActive(dept)}
                        className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                          dept.is_active
                            ? "text-muted-foreground hover:bg-[color-mix(in_srgb,var(--da-red)_12%,transparent)] hover:text-red-600"
                            : "text-emerald-600 hover:bg-[color-mix(in_srgb,var(--da-green)_12%,transparent)]"
                        }`}
                      >
                        {dept.is_active ? (
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
                    </div>
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
