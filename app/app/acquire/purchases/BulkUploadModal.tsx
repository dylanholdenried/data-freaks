"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IC } from "@/lib/inventory-command/midmo";
import { ACQ_EXIT_STRATEGIES, ACQ_SOURCE_TYPES, ACQ_STAGES } from "@/lib/acquire/types";
import { ACQ_BULK_TEMPLATE_FILENAME } from "@/lib/acquire/bulk-upload";
import {
  bulkUploadAcquirePurchasesAction,
  getAcquirePurchasesTemplateCsvAction,
} from "../actions";
import { Download, Loader2, Upload, X } from "lucide-react";

export default function BulkUploadModal({
  storeNames,
  onClose,
}: {
  storeNames: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function downloadTemplate() {
    setError(null);
    try {
      const csv = await getAcquirePurchasesTemplateCsvAction();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = ACQ_BULK_TEMPLATE_FILENAME;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Template download failed");
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setWarnings([]);
    setResultMsg(null);
    if (!file) {
      setError("Choose a CSV file.");
      return;
    }
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      const res = await bulkUploadAcquirePurchasesAction(fd);
      if (!res.ok) {
        setError(res.error);
        setWarnings(res.warnings ?? []);
        return;
      }
      setWarnings(res.warnings);
      setResultMsg(
        `Imported ${res.inserted} purchase${res.inserted === 1 ? "" : "s"}${
          res.skipped ? ` · ${res.skipped} skipped` : ""
        }.`
      );
      setFile(null);
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-black/60" aria-label="Close" onClick={onClose} />
      <div
        className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl border p-4 shadow-2xl"
        style={{ background: IC.panel, borderColor: IC.border, color: IC.text }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide">Bulk upload</h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-white/5" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-3 text-xs" style={{ color: IC.muted }}>
          Upload a CSV of purchases. Only <span className="font-semibold" style={{ color: IC.text }}>dealership</span>{" "}
          is required per row — all other fields can be blank. Match dealership to a store name (or last word, e.g.
          Fenton).
        </p>

        <div
          className="mb-4 rounded-lg border px-3 py-2 text-[11px] leading-relaxed"
          style={{ borderColor: IC.border, background: IC.rowAlt, color: IC.muted }}
        >
          <p className="font-semibold uppercase tracking-wide" style={{ color: IC.text }}>
            Your stores
          </p>
          <p className="mt-1">{storeNames.join(" · ") || "—"}</p>
          <p className="mt-2">Status: {ACQ_STAGES.join(", ")}</p>
          <p className="mt-1">Source: {ACQ_SOURCE_TYPES.join(", ")}</p>
          <p className="mt-1">Exit: {ACQ_EXIT_STRATEGIES.join(", ")}</p>
        </div>

        <button
          type="button"
          onClick={() => void downloadTemplate()}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold"
          style={{ borderColor: IC.border, color: IC.blue }}
        >
          <Download className="h-3.5 w-3.5" />
          Download CSV template
        </button>

        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block text-xs">
            <span style={{ color: IC.muted }}>CSV file</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="mt-1 block w-full text-xs"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>

          {error ? (
            <p className="text-xs" style={{ color: IC.red }}>
              {error}
            </p>
          ) : null}
          {resultMsg ? (
            <p className="text-xs font-medium" style={{ color: IC.green }}>
              {resultMsg}
            </p>
          ) : null}
          {warnings.length ? (
            <div
              className="max-h-32 overflow-y-auto rounded-md border px-2 py-2 text-[11px]"
              style={{ borderColor: IC.border, color: IC.muted }}
            >
              {warnings.slice(0, 40).map((w, i) => (
                <p key={`${i}-${w.slice(0, 24)}`}>{w}</p>
              ))}
              {warnings.length > 40 ? <p>…and {warnings.length - 40} more</p> : null}
            </div>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border px-3 py-2 text-xs font-semibold"
              style={{ borderColor: IC.border, color: IC.muted }}
            >
              Close
            </button>
            <button
              type="submit"
              disabled={pending || !file}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
              style={{ background: IC.blue }}
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {pending ? "Uploading…" : "Upload CSV"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
