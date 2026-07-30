"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Loader2, Upload } from "lucide-react";
import {
  getInventoryTemplateCsvAction,
  uploadInventoryExportAction,
  type InventoryUploadResult,
} from "./actions";
import { INVENTORY_TEMPLATE_FILENAME } from "@/lib/inventory-command/template";

type Group = { id: string; name: string; plan: string };
type Store = { id: string; name: string; dealer_group_id: string };
type Recent = {
  id: string;
  store_id: string;
  snapshot_date: string;
  source_filename: string | null;
  row_count: number | null;
  created_at: string;
};

export default function InventoryUploadClient({
  groups,
  stores,
  recent,
}: {
  groups: Group[];
  stores: Store[];
  recent: Recent[];
}) {
  const [groupId, setGroupId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [snapshotDate, setSnapshotDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InventoryUploadResult | null>(null);
  const [pending, startTransition] = useTransition();

  const groupStores = useMemo(
    () => stores.filter((s) => s.dealer_group_id === groupId),
    [stores, groupId]
  );

  const storeNameById = useMemo(() => {
    const m = new Map(stores.map((s) => [s.id, s.name]));
    return m;
  }, [stores]);

  async function downloadTemplate() {
    setError(null);
    try {
      const csv = await getInventoryTemplateCsvAction();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = INVENTORY_TEMPLATE_FILENAME;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Template download failed");
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!file) {
      setError("Choose a file");
      return;
    }
    const fd = new FormData();
    fd.set("dealerGroupId", groupId);
    fd.set("storeId", storeId);
    fd.set("snapshotDate", snapshotDate);
    fd.set("file", file);

    startTransition(async () => {
      const res = await uploadInventoryExportAction(fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(res);
      setFile(null);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Inventory upload</h1>
          <p className="text-sm text-slate-500">
            Upload a vAuto Merchandising export (.xls) or CSV template — one store per file.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Download template
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload export</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-slate-600">
                Auto Group
                <select
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={groupId}
                  onChange={(e) => {
                    setGroupId(e.target.value);
                    setStoreId("");
                  }}
                  required
                >
                  <option value="">Select group…</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.plan})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Store
                <select
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={storeId}
                  onChange={(e) => setStoreId(e.target.value)}
                  required
                  disabled={!groupId}
                >
                  <option value="">Select store…</option>
                  {groupStores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Snapshot date
                <input
                  type="date"
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={snapshotDate}
                  onChange={(e) => setSnapshotDate(e.target.value)}
                  required
                />
              </label>
              <label className="block text-xs font-medium text-slate-600">
                Export file
                <input
                  type="file"
                  accept=".xls,.xlsx,.csv,application/vnd.ms-excel,text/csv"
                  className="mt-1 block w-full text-sm"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  required
                />
              </label>
            </div>

            {error ? (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}
            {result ? (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {result.replaced ? "Replaced" : "Created"} snapshot for {result.snapshotDate}:{" "}
                {result.unitCount} units, {result.arrivals} arrivals, {result.exits} exits,{" "}
                {result.priceActions} price actions.
              </p>
            ) : null}

            <Button type="submit" disabled={pending || !groupId || !storeId || !file}>
              {pending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="mr-1.5 h-3.5 w-3.5" />
              )}
              Upload
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent snapshots</CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-slate-500">No uploads yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="text-slate-500">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Store</th>
                    <th className="py-2 pr-3 font-medium">File</th>
                    <th className="py-2 pr-3 font-medium">Rows</th>
                    <th className="py-2 font-medium">Uploaded</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="py-2 pr-3">{r.snapshot_date}</td>
                      <td className="py-2 pr-3">{storeNameById.get(r.store_id) ?? r.store_id}</td>
                      <td className="py-2 pr-3">{r.source_filename ?? "—"}</td>
                      <td className="py-2 pr-3">{r.row_count ?? "—"}</td>
                      <td className="py-2">
                        {new Date(r.created_at).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
