"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IcKpi,
  IcPanel,
  IcRoot,
  icDisplay,
  icSans,
} from "@/app/app/inventory-command/ui/primitives";
import { IC } from "@/lib/inventory-command/midmo";
import type { AcqPurchase, AcqSourceType } from "@/lib/acquire/types";
import { ACQ_SOURCE_LABELS, ACQ_SOURCE_TYPES } from "@/lib/acquire/types";
import { computeAcquirePerformance, computeReconByStore } from "@/lib/acquire/performance";
import { formatMoney } from "@/lib/acquire/cost";
import { storesQueryString } from "@/lib/acquire/store-labels";
import AcquireStorePills from "../AcquireStorePills";

function signedMoney(n: number | null): string {
  if (n == null) return "—";
  return `${n > 0 ? "+" : ""}${formatMoney(n)}`;
}

function signedPct(n: number | null): string {
  if (n == null) return "—";
  const pct = Math.round(n * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

/** Over estimate reads red (cost overrun), under reads green. */
function varianceColor(n: number | null): string {
  if (n == null || n === 0) return IC.muted;
  return n > 0 ? IC.red : IC.green;
}

export default function PerformanceClient({
  stores,
  initialStoreIds,
  purchases,
}: {
  stores: { id: string; name: string }[];
  initialStoreIds: string[];
  purchases: AcqPurchase[];
}) {
  const router = useRouter();
  const allIds = stores.map((s) => s.id);
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>(
    initialStoreIds.length ? initialStoreIds : allIds
  );
  const [sourceFilter, setSourceFilter] = useState<AcqSourceType | "all">("all");

  const scoped = useMemo(() => {
    const allowed = new Set(selectedStoreIds);
    let list = purchases.filter((p) => p.store_id == null || allowed.has(p.store_id));
    if (sourceFilter !== "all") {
      list = list.filter((p) => p.source_type === sourceFilter);
    }
    return list;
  }, [purchases, selectedStoreIds, sourceFilter]);

  const perf = useMemo(() => computeAcquirePerformance(scoped), [scoped]);
  const recon = useMemo(() => computeReconByStore(scoped, stores), [scoped, stores]);

  function onStoresChange(next: string[]) {
    setSelectedStoreIds(next);
    const qs = storesQueryString(next, allIds);
    router.replace(qs ? `/app/acquire/performance?${qs}` : "/app/acquire/performance");
  }

  return (
    <IcRoot className={`${icSans.variable} ${icDisplay.variable}`}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.2em]"
            style={{ color: IC.muted }}
          >
            Acquire
          </p>
          <h1
            className="text-3xl font-bold tracking-tight"
            style={{
              fontFamily: "var(--ic-font-display), Barlow Condensed, sans-serif",
              color: IC.text,
            }}
          >
            Performance
          </h1>
          <p className="mt-1 text-sm" style={{ color: IC.muted }}>
            Manual Acquire economics only. Exit strategy is sold economics (Prime, Subprime, Cash,
            Wholesale, Internal Transfer, Arbitrated) — separate from pipeline stage.
          </p>
        </div>
        <select
          value={sourceFilter}
          onChange={(e) =>
            setSourceFilter(e.target.value === "all" ? "all" : (e.target.value as AcqSourceType))
          }
          className="rounded-md border px-3 py-2 text-xs font-medium"
          style={{ background: IC.panel, borderColor: IC.border, color: IC.text }}
        >
          <option value="all">All sources</option>
          {ACQ_SOURCE_TYPES.map((s) => (
            <option key={s} value={s}>
              {ACQ_SOURCE_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: IC.muted }}>
          Stores
        </p>
        <AcquireStorePills
          stores={stores}
          selectedIds={selectedStoreIds}
          onChange={onStoresChange}
        />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <IcKpi label="Sold this month" value={perf.soldThisMonth} status="ok" />
        <IcKpi
          label="Avg gross / deal"
          value={perf.avgGrossPerDeal != null ? formatMoney(perf.avgGrossPerDeal) : "—"}
        />
        <IcKpi label="Wholesale queue" value={perf.wholesaleQueueCount} />
        <IcKpi
          label="Arb open / done"
          value={`${perf.arbOpenCount} / ${perf.arbCompleteCount}`}
          status={perf.arbOpenCount ? "warn" : "neutral"}
        />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <IcKpi label="Retail-like sold" value={perf.retailLikeSoldCount} />
        <IcKpi label="Wholesale exit" value={perf.wholesaleExitSoldCount} />
        <IcKpi label="Internal transfer" value={perf.transferSoldCount} />
      </div>

      <IcPanel title="Sold by exit strategy" note="Sold + Arbitration Complete">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {perf.byExitStrategy.map((row) => (
            <div
              key={row.strategy}
              className="rounded-lg border px-3 py-2"
              style={{ borderColor: IC.border, background: IC.rowAlt }}
            >
              <p className="text-[10px] uppercase tracking-wide" style={{ color: IC.muted }}>
                {row.label}
              </p>
              <p
                className="text-2xl font-bold"
                style={{
                  fontFamily: "var(--ic-font-display), Barlow Condensed, sans-serif",
                }}
              >
                {row.count}
              </p>
            </div>
          ))}
        </div>
      </IcPanel>

      <IcPanel title="Units by stage">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          {perf.stageCounts.map((row) => (
            <div
              key={row.stage}
              className="rounded-lg border px-3 py-2"
              style={{ borderColor: IC.border, background: IC.rowAlt }}
            >
              <p className="text-[10px] uppercase tracking-wide" style={{ color: IC.muted }}>
                {row.label}
              </p>
              <p
                className="text-2xl font-bold"
                style={{
                  fontFamily: "var(--ic-font-display), Barlow Condensed, sans-serif",
                }}
              >
                {row.count}
              </p>
            </div>
          ))}
        </div>
      </IcPanel>

      <IcPanel
        title="Reconditioning by store"
        note="Units with actual recon entered · variance = actual − estimate"
      >
        <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <IcKpi
            label="Avg recon / unit"
            value={formatMoney(recon.total.avgRecon)}
            sub={`${recon.total.reconCount} units · ${formatMoney(recon.total.totalRecon)} total`}
          />
          <IcKpi
            label="Avg estimate"
            value={formatMoney(recon.total.avgEstimate)}
            sub={`${recon.total.comparedCount} units with estimate + actual`}
          />
          <IcKpi
            label="Avg vs estimate"
            value={signedMoney(recon.total.avgVariance)}
            sub={`${signedPct(recon.total.avgVariancePct)} of estimate`}
            status={
              recon.total.avgVariance == null || recon.total.avgVariance === 0
                ? "neutral"
                : recon.total.avgVariance > 0
                  ? "bad"
                  : "ok"
            }
          />
          <IcKpi
            label="Over / under estimate"
            value={`${recon.total.overCount} / ${recon.total.underCount}`}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead>
              <tr style={{ color: IC.muted }}>
                <th className="px-2 py-2 font-semibold">Store</th>
                <th className="px-2 py-2 font-semibold">Units</th>
                <th className="px-2 py-2 font-semibold">Avg recon</th>
                <th className="px-2 py-2 font-semibold">Total recon</th>
                <th className="px-2 py-2 font-semibold">Compared</th>
                <th className="px-2 py-2 font-semibold">Avg estimate</th>
                <th className="px-2 py-2 font-semibold">Avg actual</th>
                <th className="px-2 py-2 font-semibold">Avg vs est</th>
                <th className="px-2 py-2 font-semibold">Avg vs est %</th>
                <th className="px-2 py-2 font-semibold">Over / Under</th>
              </tr>
            </thead>
            <tbody>
              {recon.rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-2 py-6 text-center" style={{ color: IC.muted }}>
                    No actual recon costs entered yet.
                  </td>
                </tr>
              ) : (
                [...recon.rows, ...(recon.rows.length > 1 ? [recon.total] : [])].map((row) => {
                  const isTotal = row === recon.total;
                  return (
                    <tr
                      key={isTotal ? "__total" : (row.storeId ?? "__unassigned")}
                      style={{
                        borderTop: `1px solid ${isTotal ? IC.border : IC.line}`,
                        fontWeight: isTotal ? 600 : undefined,
                      }}
                    >
                      <td className="px-2 py-2 font-medium">{row.storeName}</td>
                      <td className="px-2 py-2 tabular-nums">{row.reconCount}</td>
                      <td className="px-2 py-2 tabular-nums">{formatMoney(row.avgRecon)}</td>
                      <td className="px-2 py-2 tabular-nums">{formatMoney(row.totalRecon)}</td>
                      <td className="px-2 py-2 tabular-nums">{row.comparedCount}</td>
                      <td className="px-2 py-2 tabular-nums">{formatMoney(row.avgEstimate)}</td>
                      <td className="px-2 py-2 tabular-nums">
                        {formatMoney(row.avgActualCompared)}
                      </td>
                      <td
                        className="px-2 py-2 tabular-nums"
                        style={{ color: varianceColor(row.avgVariance) }}
                      >
                        {signedMoney(row.avgVariance)}
                      </td>
                      <td
                        className="px-2 py-2 tabular-nums"
                        style={{ color: varianceColor(row.avgVariancePct) }}
                      >
                        {signedPct(row.avgVariancePct)}
                      </td>
                      <td className="px-2 py-2 tabular-nums">
                        {row.overCount} / {row.underCount}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </IcPanel>

      <IcPanel title="By acquisition source" note="Sold cars only for spreads & gross">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr style={{ color: IC.muted }}>
                <th className="px-2 py-2 font-semibold">Source</th>
                <th className="px-2 py-2 font-semibold">Sold</th>
                <th className="px-2 py-2 font-semibold">Retail / WS / Xfer</th>
                <th className="px-2 py-2 font-semibold">Avg gross</th>
                <th className="px-2 py-2 font-semibold">Avg vs MMR</th>
                <th className="px-2 py-2 font-semibold">Avg vs JD</th>
                <th className="px-2 py-2 font-semibold">Arb open/done</th>
              </tr>
            </thead>
            <tbody>
              {perf.bySource.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-2 py-6 text-center" style={{ color: IC.muted }}>
                    No purchase data yet.
                  </td>
                </tr>
              ) : (
                perf.bySource.map((row) => (
                  <tr key={row.source_type} style={{ borderTop: `1px solid ${IC.line}` }}>
                    <td className="px-2 py-2 font-medium">{row.label}</td>
                    <td className="px-2 py-2 tabular-nums">{row.soldCount}</td>
                    <td className="px-2 py-2 tabular-nums">
                      {row.retailLikeSoldCount} / {row.wholesaleExitSoldCount} /{" "}
                      {row.transferSoldCount}
                    </td>
                    <td className="px-2 py-2 tabular-nums">
                      {row.avgGross != null ? formatMoney(row.avgGross) : "—"}
                    </td>
                    <td className="px-2 py-2 tabular-nums">
                      {row.avgMmrSpread != null ? formatMoney(row.avgMmrSpread) : "—"}
                    </td>
                    <td className="px-2 py-2 tabular-nums">
                      {row.avgJdSpread != null ? formatMoney(row.avgJdSpread) : "—"}
                    </td>
                    <td className="px-2 py-2 tabular-nums">
                      {row.arbOpenCount} / {row.arbCompleteCount}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </IcPanel>

      <IcPanel title="Sale vs books at purchase (by model)" note="Ranked by avg sale over purchase MMR">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr style={{ color: IC.muted }}>
                <th className="px-2 py-2 font-semibold">Make / Model</th>
                <th className="px-2 py-2 font-semibold">Sold</th>
                <th className="px-2 py-2 font-semibold">Avg over MMR</th>
                <th className="px-2 py-2 font-semibold">Avg over JD</th>
                <th className="px-2 py-2 font-semibold">Avg gross</th>
              </tr>
            </thead>
            <tbody>
              {perf.byModel.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-2 py-6 text-center" style={{ color: IC.muted }}>
                    No sold purchase cars with book values yet.
                  </td>
                </tr>
              ) : (
                perf.byModel.map((row) => (
                  <tr key={row.key} style={{ borderTop: `1px solid ${IC.line}` }}>
                    <td className="px-2 py-2 font-medium">
                      {row.make} {row.model}
                    </td>
                    <td className="px-2 py-2 tabular-nums">{row.soldCount}</td>
                    <td
                      className="px-2 py-2 tabular-nums"
                      style={{
                        color:
                          row.avgSaleOverMmr == null
                            ? IC.muted
                            : row.avgSaleOverMmr >= 0
                              ? IC.green
                              : IC.red,
                      }}
                    >
                      {row.avgSaleOverMmr != null ? formatMoney(row.avgSaleOverMmr) : "—"}
                    </td>
                    <td className="px-2 py-2 tabular-nums">
                      {row.avgSaleOverJd != null ? formatMoney(row.avgSaleOverJd) : "—"}
                    </td>
                    <td className="px-2 py-2 tabular-nums">
                      {row.avgGross != null ? formatMoney(row.avgGross) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </IcPanel>

      <IcPanel title="Sold by month">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-xs">
            <thead>
              <tr style={{ color: IC.muted }}>
                <th className="px-2 py-2 font-semibold">Month</th>
                <th className="px-2 py-2 font-semibold">Units</th>
                <th className="px-2 py-2 font-semibold">Total gross</th>
                <th className="px-2 py-2 font-semibold">Avg gross</th>
              </tr>
            </thead>
            <tbody>
              {perf.soldByMonth.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-2 py-6 text-center" style={{ color: IC.muted }}>
                    No sold months yet.
                  </td>
                </tr>
              ) : (
                perf.soldByMonth.map((row) => (
                  <tr key={row.month} style={{ borderTop: `1px solid ${IC.line}` }}>
                    <td className="px-2 py-2 font-medium">{row.month}</td>
                    <td className="px-2 py-2 tabular-nums">{row.count}</td>
                    <td className="px-2 py-2 tabular-nums">{formatMoney(row.totalGross)}</td>
                    <td className="px-2 py-2 tabular-nums">
                      {row.avgGross != null ? formatMoney(row.avgGross) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </IcPanel>
    </IcRoot>
  );
}
