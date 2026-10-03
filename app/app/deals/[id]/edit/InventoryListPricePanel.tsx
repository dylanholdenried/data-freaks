"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { setDealListPriceOverride } from "@/app/app/deals/actions";
import {
  DISPOSITION_MATCH_LABEL,
  dealDiscount,
  dealDiscountPct,
  dispositionMatch,
  formatDisposition,
  formatFinanceTypeLabel,
  toNum,
} from "@/lib/pricing-discipline/metrics";

const LBL = "text-xs font-medium text-muted-foreground";
const TILE =
  "flex h-10 items-center rounded-md border border-border px-3 text-sm tabular-nums";

type Locked = {
  listPrice: number | null;
  listPriceNa: boolean;
  source: string | null;
  listPriceAt: string | null;
  disp: string | null;
  pom: number | null;
};

type Preview = {
  listPrice: number | null;
  pom: number | null;
  disp: string | null;
  snapshotDate: string | null;
  priceSnapshotDate: string | null;
};

interface Props {
  dealId: string;
  storeId: string;
  stockNumber: string;
  saleDate: string;
  dealStatus: string;
  salePrice: number | null;
  financeType: string;
  initial: Locked;
  canOverride: boolean;
  readOnly: boolean;
}

function usd(v: number | null): string {
  if (v == null) return "—";
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function SourceBadge({ source, asOf }: { source: string | null; asOf: string | null }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    inventory_snapshot: {
      label: asOf ? `From inventory (as of ${asOf.slice(0, 10)})` : "From inventory",
      cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    },
    missing: {
      label: "Missing — awaiting admin",
      cls: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
    },
    manual: {
      label: "Manual (admin)",
      cls: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
    },
    legacy: {
      label: "Legacy (typed)",
      cls: "bg-muted text-muted-foreground",
    },
  };
  const c = source ? cfg[source] : null;
  if (!c) return null;
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", c.cls)}>
      {c.label}
    </span>
  );
}

export default function InventoryListPricePanel({
  dealId,
  storeId,
  stockNumber,
  saleDate,
  dealStatus,
  salePrice,
  financeType,
  initial,
  canOverride,
  readOnly,
}: Props) {
  const [locked, setLocked] = useState<Locked>(initial);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [overrideValue, setOverrideValue] = useState("");
  const [savingOverride, setSavingOverride] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  const isClosed = dealStatus === "closed";
  const hasLocked = isClosed || locked.source === "manual";

  useEffect(() => {
    if (hasLocked || !storeId || !stockNumber.trim()) {
      setPreview(null);
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data } = await supabase.rpc("resolve_inventory_pricing", {
          p_store_id: storeId,
          p_stock_number: stockNumber.trim(),
          p_sale_date: saleDate || null,
        });
        if (cancelled) return;
        const row = (Array.isArray(data) ? data[0] : data) as
          | {
              list_price: number | null;
              pom: number | null;
              disp: string | null;
              snapshot_date: string | null;
              price_snapshot_date: string | null;
            }
          | undefined;
        setPreview(
          row
            ? {
                listPrice: toNum(row.list_price),
                pom: toNum(row.pom),
                disp: row.disp,
                snapshotDate: row.snapshot_date,
                priceSnapshotDate: row.price_snapshot_date,
              }
            : null
        );
      } catch {
        if (!cancelled) setPreview(null);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [hasLocked, storeId, stockNumber, saleDate]);

  const shown = hasLocked
    ? {
        listPrice: locked.listPriceNa ? null : locked.listPrice,
        pom: locked.pom,
        disp: locked.disp,
        asOf: locked.listPriceAt,
      }
    : {
        listPrice: preview?.listPrice ?? null,
        pom: preview?.pom ?? null,
        disp: preview?.disp ?? null,
        asOf: preview?.priceSnapshotDate ?? preview?.snapshotDate ?? null,
      };

  const discount = dealDiscount({ list_price: shown.listPrice, sale_price: salePrice });
  const discountPct = dealDiscountPct({ list_price: shown.listPrice, sale_price: salePrice });
  const match = dispositionMatch(shown.disp, financeType || null);

  async function saveOverride(mode: "manual" | "revert") {
    setOverrideError(null);
    let value = 0;
    if (mode === "manual") {
      value = parseFloat(overrideValue);
      if (!Number.isFinite(value) || value <= 0) {
        setOverrideError("Enter a positive list price.");
        return;
      }
    }
    setSavingOverride(true);
    try {
      const result =
        mode === "manual"
          ? await setDealListPriceOverride({ dealId, mode, listPrice: value })
          : await setDealListPriceOverride({ dealId, mode });
      if (!result.ok) throw new Error(result.error);
      setLocked({
        listPrice: result.listPrice,
        listPriceNa: result.listPriceNa,
        source: result.listPriceSource,
        listPriceAt: result.listPriceAt,
        disp: result.saleInvDisp,
        pom: result.salePom,
      });
      setOverrideValue("");
    } catch (err) {
      setOverrideError(err instanceof Error ? err.message : "Could not save list price.");
    } finally {
      setSavingOverride(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">List price (from inventory)</span>
          {hasLocked ? (
            <SourceBadge source={locked.source} asOf={locked.listPriceAt} />
          ) : (
            <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {previewLoading
                ? "Looking up inventory…"
                : preview?.listPrice != null
                  ? `Preview as of ${(shown.asOf ?? "").slice(0, 10)} — locks on close`
                  : stockNumber.trim()
                    ? "Not found in inventory — will be NA on close"
                    : "Enter a stock number"}
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          Pulled from the daily inventory upload; not editable.
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <label className={LBL}>List price</label>
          <div className={cn(TILE, shown.listPrice == null && "text-muted-foreground")}>
            {shown.listPrice == null ? "NA" : usd(shown.listPrice)}
          </div>
        </div>
        <div className="space-y-1">
          <label className={LBL}>Discount (list − sale)</label>
          <div
            className={cn(
              TILE,
              discount == null
                ? "text-muted-foreground"
                : discount > 0
                  ? "text-red-600"
                  : "text-emerald-600"
            )}
          >
            {discount == null
              ? "—"
              : `${usd(discount)}${discountPct != null ? ` (${discountPct.toFixed(1)}%)` : ""}`}
          </div>
        </div>
        <div className="space-y-1">
          <label className={LBL}>Adj % of market at sale</label>
          <div className={cn(TILE, shown.pom == null && "text-muted-foreground")}>
            {shown.pom == null ? "—" : `${shown.pom.toFixed(1)}%`}
          </div>
        </div>
        <div className="space-y-1">
          <label className={LBL}>Planned disposition vs finance type</label>
          <div
            className={cn(
              TILE,
              "gap-2",
              match === "match"
                ? "text-emerald-600"
                : match === "unknown"
                  ? "text-muted-foreground"
                  : "text-amber-700 dark:text-amber-300"
            )}
          >
            <span>
              {formatDisposition(shown.disp)} → {formatFinanceTypeLabel(financeType || null)}
            </span>
            {match !== "unknown" ? (
              <span className="text-xs">({DISPOSITION_MATCH_LABEL[match]})</span>
            ) : null}
          </div>
        </div>
      </div>

      {canOverride && !readOnly ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <span className="text-xs font-medium text-muted-foreground">Admin override:</span>
          <Input
            type="number"
            step="1"
            min={0}
            value={overrideValue}
            onChange={(e) => setOverrideValue(e.target.value)}
            placeholder="Set list price"
            className="h-8 max-w-[160px]"
            disabled={savingOverride}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={savingOverride || !overrideValue.trim()}
            onClick={() => saveOverride("manual")}
          >
            {savingOverride ? "Saving…" : "Save list price"}
          </Button>
          {locked.source === "manual" ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={savingOverride}
              onClick={() => saveOverride("revert")}
            >
              Revert to inventory
            </Button>
          ) : null}
          {overrideError ? <span className="text-xs text-red-600">{overrideError}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
