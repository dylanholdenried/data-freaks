"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  cancelBatch,
  confirmBatch,
  createBatchFromCsv,
  getTemplateCsvAction,
  unwindBatch,
  type BatchPreview,
  type ImportBatchHistoryItem,
} from "./actions";
import { openStoreViewForGroupAction } from "@/app/app/group-actions";
import { AlertTriangle, CheckCircle2, Download, Loader2, RotateCcw, Upload } from "lucide-react";

type Group = { id: string; name: string };
type Store = { id: string; name: string; dealer_group_id: string };

type Props = {
  groups: Group[];
  stores: Store[];
  history: ImportBatchHistoryItem[];
};

type Step = "select" | "preview" | "done";

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusLabel(status: string) {
  switch (status) {
    case "committed":
      return "Committed";
    case "pending_review":
      return "Pending review";
    case "cancelled":
      return "Cancelled";
    case "unwound":
      return "Unwound";
    default:
      return status;
  }
}

export default function BulkUploadClient({ groups, stores, history: initialHistory }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("select");
  const [groupId, setGroupId] = useState("");
  const [storeId, setStoreId] = useState("");
  const [preview, setPreview] = useState<BatchPreview | null>(null);
  const [result, setResult] = useState<{ inserted: number; created_refs: number } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [historyMessage, setHistoryMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [unwindingId, setUnwindingId] = useState<string | null>(null);

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
          const res = await createBatchFromCsv({
            dealerGroupId: groupId,
            storeId,
            fileName: file.name,
            csvText,
          });
          if (!res.ok) {
            setError(res.error);
            return;
          }
          setPreview(res.preview);
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
        router.refresh();
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
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Cancel failed");
      }
    });
  }

  function handleUnwind(batch: ImportBatchHistoryItem) {
    const ok = window.confirm(
      `Unwind this upload?\n\n${batch.fileName}\n${batch.dealerGroupName} / ${batch.storeName}\n\nThis permanently deletes the deals created by this import from the Sales Registry. Roster items (salespeople / F&I) are kept.`
    );
    if (!ok) return;

    setHistoryMessage(null);
    setError(null);
    setUnwindingId(batch.id);
    startTransition(async () => {
      try {
        const res = await unwindBatch(batch.id);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setHistoryMessage(
          `Unwound upload — deleted ${res.deleted} deal${res.deleted === 1 ? "" : "s"}.`
        );
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unwind failed");
      } finally {
        setUnwindingId(null);
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
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
          Bulk Deal Upload
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Import deals for one store at a time. Incomplete rows import as pending; fully complete
          rows import as closed. Confirm the preview before anything is written to Supabase. Use
          Upload history below to review past imports or unwind a committed upload.
        </p>
      </section>

      {error ? (
        <div className="rounded-lg border border-[color-mix(in_srgb,var(--da-red)_35%,transparent)] bg-[color-mix(in_srgb,var(--da-red)_12%,transparent)] px-4 py-3 text-sm text-[var(--da-red)]">
          {error}
        </div>
      ) : null}

      {historyMessage ? (
        <div className="rounded-lg border border-[color-mix(in_srgb,var(--da-green)_35%,transparent)] bg-[color-mix(in_srgb,var(--da-green)_12%,transparent)] px-4 py-3 text-sm text-[var(--da-green)]">
          {historyMessage}
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
                <span className="text-xs font-medium text-muted-foreground">Auto Group</span>
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
                <span className="text-xs font-medium text-muted-foreground">Store</span>
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
              <div className="rounded-lg border border-[color-mix(in_srgb,var(--da-amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--da-amber)_12%,transparent)] px-4 py-3 text-sm text-[var(--da-amber)]">
                <p className="font-medium">All rows will import into</p>
                <p className="mt-0.5 text-base font-semibold">
                  {selectedGroup.name} / {selectedStore.name}
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
            <p className="text-sm text-muted-foreground">
              Use the standard template. Blank optional fields import as{" "}
              <span className="font-medium">pending</span>; complete rows as{" "}
              <span className="font-medium">closed</span>. Dates accept YYYY-MM-DD, M/D/YY, or
              M/D/YYYY.
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
                    "inline-flex h-10 items-center rounded-md bg-[var(--da-text)] px-4 text-sm font-medium text-[var(--da-bg)] " +
                    (!groupId || !storeId || pending
                      ? "cursor-not-allowed opacity-50"
                      : "hover:opacity-90")
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
            <div className="sticky top-0 z-10 rounded-lg border border-[color-mix(in_srgb,var(--da-amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--da-amber)_12%,transparent)] px-4 py-3 text-sm text-[var(--da-amber)]">
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
              <span className="text-[var(--da-red)]">
                Errors: <strong>{preview.errorCount}</strong>
              </span>
            </div>

            {preview.willCreate.length > 0 ? (
              <div className="rounded-lg border border-border bg-muted px-4 py-3 text-sm">
                <p className="font-medium text-foreground">Will create on confirm</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                  {preview.willCreate.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {preview.errorCount > 0 ? (
              <div className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--da-red)_35%,transparent)] bg-[color-mix(in_srgb,var(--da-red)_12%,transparent)] px-4 py-3 text-sm text-[var(--da-red)]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>Fix the CSV and re-upload. Confirm is disabled until every row is valid.</p>
              </div>
            ) : null}

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-muted text-xs uppercase text-muted-foreground">
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
                          ? "border-t border-border"
                          : "border-t border-[color-mix(in_srgb,var(--da-red)_25%,transparent)] bg-[color-mix(in_srgb,var(--da-red)_10%,transparent)]"
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
                          <span className="text-[var(--da-red)]">Error</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
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
              <Button type="button" variant="outline" onClick={handleCancel} disabled={pending}>
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
            <div className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--da-green)_35%,transparent)] bg-[color-mix(in_srgb,var(--da-green)_12%,transparent)] px-4 py-3 text-sm text-[var(--da-green)]">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">
                  Inserted {result.inserted} deal
                  {result.inserted === 1 ? "" : "s"} into {preview.dealerGroupName} /{" "}
                  {preview.storeName}
                </p>
                {result.created_refs > 0 ? (
                  <p className="mt-1 text-[var(--da-green)]">
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Recent import batches. Unwind permanently deletes deals from that upload (trades and
            notes cascade). Salespeople / F&amp;I created during import are kept.
          </p>
          {initialHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No uploads yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-muted text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Uploaded</th>
                    <th className="px-3 py-2">File</th>
                    <th className="px-3 py-2">Store</th>
                    <th className="px-3 py-2">Rows</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {initialHistory.map((b) => (
                    <tr key={b.id} className="border-t border-border">
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                        {formatWhen(b.createdAt)}
                      </td>
                      <td className="px-3 py-2 font-medium text-foreground">{b.fileName}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {b.dealerGroupName} / {b.storeName}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">
                        {b.validCount}/{b.rowCount}
                        {b.linkedDealCount > 0 ? (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({b.linkedDealCount} linked)
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={
                            b.status === "committed"
                              ? "text-emerald-700"
                              : b.status === "unwound"
                                ? "text-amber-700"
                                : b.status === "cancelled"
                                  ? "text-muted-foreground"
                                  : "text-foreground"
                          }
                        >
                          {statusLabel(b.status)}
                        </span>
                        {b.status === "committed" && b.committedAt ? (
                          <div className="text-xs text-muted-foreground">{formatWhen(b.committedAt)}</div>
                        ) : null}
                        {b.status === "unwound" && b.unwoundAt ? (
                          <div className="text-xs text-muted-foreground">{formatWhen(b.unwoundAt)}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        {b.status === "committed" ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={pending || unwindingId === b.id}
                            onClick={() => handleUnwind(b)}
                          >
                            {unwindingId === b.id ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            Unwind
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
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
