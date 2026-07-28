"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  cancelBatch,
  confirmBatch,
  createBatchFromCsv,
  getTemplateCsvAction,
  type BatchPreview,
} from "./actions";
import { openStoreViewForGroupAction } from "@/app/app/group-actions";
import { AlertTriangle, CheckCircle2, Download, Loader2, Upload } from "lucide-react";

type Group = { id: string; name: string };
type Store = { id: string; name: string; dealer_group_id: string };

type Props = {
  groups: Group[];
  stores: Store[];
};

type Step = "select" | "preview" | "done";

export default function BulkUploadClient({ groups, stores }: Props) {
  const [step, setStep] = useState<Step>("select");
  const [groupId, setGroupId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [preview, setPreview] = useState<BatchPreview | null>(null);
  const [result, setResult] = useState<{ inserted: number; created_refs: number } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const groupStores = useMemo(
    () => stores.filter((s) => s.dealer_group_id === groupId),
    [stores, groupId]
  );

  const selectedGroup = groups.find((g) => g.id === groupId);
  const selectedStore = groupStores.find((s) => s.id === storeId);

  function onGroupChange(id: string) {
    setGroupId(id);
    setStoreId("");
    setPreview(null);
    setStep("select");
    setError(null);
  }

  function onStoreChange(id: string) {
    setStoreId(id);
    setPreview(null);
    setStep("select");
    setError(null);
  }

  async function downloadTemplate() {
    setError(null);
    try {
      const csv = await getTemplateCsvAction();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "deal-import-template.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download template");
    }
  }

  function onFileSelected(file: File | null) {
    if (!file) return;
    if (!groupId || !storeId) {
      setError("Select an Auto Group and Store before uploading");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Upload a .csv file (Excel → Save As CSV)");
      return;
    }

    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const csvText = String(reader.result ?? "");
      startTransition(async () => {
        try {
          const next = await createBatchFromCsv({
            dealerGroupId: groupId,
            storeId,
            fileName: file.name,
            csvText,
          });
          setPreview(next);
          setStep("preview");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Upload failed");
        }
      });
    };
    reader.onerror = () => setError("Failed to read file");
    reader.readAsText(file);
  }

  function handleConfirm() {
    if (!preview) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await confirmBatch(preview.batchId);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setResult({ inserted: res.inserted, created_refs: res.created_refs });
        setStep("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Confirm failed");
      }
    });
  }

  function handleCancel() {
    if (!preview) return;
    setError(null);
    startTransition(async () => {
      try {
        await cancelBatch(preview.batchId);
        setPreview(null);
        setStep("select");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Cancel failed");
      }
    });
  }

  function resetWizard() {
    setStep("select");
    setPreview(null);
    setResult(null);
    setError(null);
  }

  const sel =
    "h-10 w-full rounded-md border border-input bg-background px-3 text-sm " +
    "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";

  return (
    <div className="space-y-6">
      <section className="app-panel p-5">
        <p className="app-kicker">Platform Admin</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
          Bulk Deal Upload
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Import deals for one store at a time. Incomplete rows import as pending; fully complete
          rows import as closed. Group and store are locked from the selectors below — never taken
          from the CSV. Confirm the preview before anything is written to Supabase.
        </p>
      </section>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {step !== "done" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Target store</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-500">Auto Group</span>
                <select
                  className={sel}
                  value={groupId}
                  onChange={(e) => onGroupChange(e.target.value)}
                  disabled={pending || step === "preview"}
                >
                  <option value="">Select Auto Group…</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-500">Store</span>
                <select
                  className={sel}
                  value={storeId}
                  onChange={(e) => onStoreChange(e.target.value)}
                  disabled={!groupId || pending || step === "preview"}
                >
                  <option value="">Select Store…</option>
                  {groupStores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {selectedGroup && selectedStore ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                <p className="font-medium">All rows will import into</p>
                <p className="mt-0.5 text-base font-semibold">
                  {selectedGroup.name} / {selectedStore.name}
                </p>
                <p className="mt-1 text-xs text-amber-800">
                  dealer_group_id and store_id are set only from this selection.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {step === "select" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. CSV file</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-600">
              Use the standard template. Excel workbooks must be saved as CSV before upload. Blank
              optional fields are allowed — those rows import as{" "}
              <span className="font-medium">pending</span>. Only rows with every closed-deal field
              filled import as <span className="font-medium">closed</span>. Sale dates accept{" "}
              <span className="font-medium">YYYY-MM-DD</span>, <span className="font-medium">M/D/YY</span>
              , or <span className="font-medium">M/D/YYYY</span>.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => void downloadTemplate()}
                disabled={pending}
              >
                <Download className="mr-2 h-4 w-4" />
                Download template
              </Button>
              <label className="inline-flex cursor-pointer items-center">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  disabled={!groupId || !storeId || pending}
                  onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
                />
                <span
                  className={
                    "inline-flex h-10 items-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white " +
                    (!groupId || !storeId || pending
                      ? "cursor-not-allowed opacity-50"
                      : "hover:bg-slate-800")
                  }
                >
                  {pending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  Upload CSV
                </span>
              </label>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === "preview" && preview ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Review & confirm</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="sticky top-0 z-10 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              Importing into{" "}
              <span className="font-semibold">
                {preview.dealerGroupName} / {preview.storeName}
              </span>{" "}
              · file <span className="font-medium">{preview.fileName}</span>
            </div>

            <div className="flex flex-wrap gap-4 text-sm">
              <span>
                Rows: <strong>{preview.rowCount}</strong>
              </span>
              <span className="text-emerald-700">
                Valid: <strong>{preview.validCount}</strong>
              </span>
              <span className="text-red-700">
                Errors: <strong>{preview.errorCount}</strong>
              </span>
            </div>

            {preview.willCreate.length > 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                <p className="font-medium text-slate-800">Will create on confirm</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
                  {preview.willCreate.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {preview.errorCount > 0 ? (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  Fix the CSV and re-upload. Confirm is disabled until every row is valid.
                </p>
              </div>
            ) : null}

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Row</th>
                    <th className="px-3 py-2">Sale date</th>
                    <th className="px-3 py-2">Stock #</th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr
                      key={r.rowNumber}
                      className={
                        r.isValid
                          ? "border-t border-slate-100"
                          : "border-t border-red-100 bg-red-50/60"
                      }
                    >
                      <td className="px-3 py-2 tabular-nums">{r.rowNumber}</td>
                      <td className="px-3 py-2">{r.saleDate || "—"}</td>
                      <td className="px-3 py-2 font-medium">{r.stockNumber || "—"}</td>
                      <td className="px-3 py-2">{r.customerLastName || "—"}</td>
                      <td className="px-3 py-2">
                        {r.isValid ? (
                          <span className="text-emerald-700">Valid</span>
                        ) : (
                          <span className="text-red-700">Error</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {[...r.errors, ...r.warnings].join("; ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={handleConfirm}
                disabled={pending || preview.errorCount > 0 || preview.validCount === 0}
              >
                {pending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Confirm import
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={pending}
              >
                Cancel batch
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === "done" && preview && result ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Import complete</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">
                  Inserted {result.inserted} deal
                  {result.inserted === 1 ? "" : "s"} into {preview.dealerGroupName} /{" "}
                  {preview.storeName}
                </p>
                {result.created_refs > 0 ? (
                  <p className="mt-1 text-emerald-800">
                    Created {result.created_refs} missing roster item
                    {result.created_refs === 1 ? "" : "s"} (salespeople / F&amp;I / sources).
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={resetWizard}>
                Upload another file
              </Button>
              <form action={openStoreViewForGroupAction}>
                <input type="hidden" name="dealer_group_id" value={preview.dealerGroupId} />
                <Button type="submit" variant="outline">
                  Open store view
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
