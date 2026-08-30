"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  aggregateByDimension,
  buildTradesByDeal,
  filterDeals,
  type ProfitDeal,
  type ProfitDealSalesperson,
  type ProfitFilters,
  type ProfitTrade,
  type RollupRow,
} from "@/lib/profit-center/aggregate";
import {
  cohortHref,
  modelCohortHref,
  profitCenterHref,
  splitMakeModel,
} from "@/lib/profit-center/cohort";
import { pcFmt$, pcFmtN, pcFmtPct } from "@/lib/profit-center/format";
import type { DateRange } from "@/lib/profit-center/dateRange";
import { cn } from "@/lib/utils";

type Store = { id: string; name: string };
type Department = { id: string; name: string; store_id: string };

export type CompareType = "model" | "acquisition" | "store";

interface Props {
  type: CompareType;
  a: string;
  b: string;
  slice?: string;
  sliceType?: "acquisition" | "model";
  stores: Store[];
  departments: Department[];
  deals: ProfitDeal[];
  trades: ProfitTrade[];
  dealSalespeople: ProfitDealSalesperson[];
  preset: string;
  range: DateRange;
  storeId: string;
  departmentName: string;
  optionsA: string[];
  optionsB: string[];
}

function metricsFor(
  deals: ProfitDeal[],
  tradesByDeal: Map<string, ProfitTrade[]>
): RollupRow {
  return aggregateByDimension("model", {
    deals,
    tradesByDeal,
    dealSalespeople: [],
    salespersonNames: new Map(),
    departmentNames: new Map(),
  }).total;
}

function MetricCard({
  label,
  left,
  right,
  format,
  lowerIsBetter = false,
}: {
  label: string;
  left: number | null;
  right: number | null;
  format: (v: number | null) => string;
  lowerIsBetter?: boolean;
}) {
  const better =
    left != null && right != null && left !== right
      ? lowerIsBetter
        ? left < right
          ? "a"
          : "b"
        : left > right
          ? "a"
          : "b"
      : null;
  return (
    <div className="pc-compare-metric">
      <div className="pc-kpi-label">{label}</div>
      <div className="pc-compare-values">
        <span className={cn(better === "a" && "is-better")}>{format(left)}</span>
        <span className="pc-compare-vs">vs</span>
        <span className={cn(better === "b" && "is-better")}>{format(right)}</span>
      </div>
    </div>
  );
}

export default function CompareClient({
  type,
  a,
  b,
  slice,
  sliceType,
  stores,
  departments,
  deals,
  trades,
  dealSalespeople,
  preset,
  range,
  storeId,
  departmentName,
  optionsA,
  optionsB,
}: Props) {
  const router = useRouter();
  const tradesByDeal = useMemo(() => buildTradesByDeal(trades), [trades]);
  const departmentNames = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of departments) m.set(d.id, d.name);
    return m;
  }, [departments]);

  const baseFilters: ProfitFilters = useMemo(
    () => ({
      storeId: type === "store" ? "all" : storeId,
      departmentName,
      make: "all",
      model: "all",
      year: "all",
      priceBandId: "all",
      acquisition: "all",
      bodyStyle: "all",
      truckClass: "all",
      salespersonId: "all",
      financeType: "all",
    }),
    [storeId, departmentName, type]
  );

  const scoped = useMemo(
    () =>
      filterDeals(deals, baseFilters, {
        tradesByDeal,
        dealSalespeople,
        departmentNames,
      }),
    [deals, baseFilters, tradesByDeal, dealSalespeople, departmentNames]
  );

  function sideDeals(side: string): ProfitDeal[] {
    if (type === "model") {
      const { make, model } = splitMakeModel(side, scoped);
      return scoped.filter(
        (d) => d.vehicle_make === make && d.vehicle_model === model
      );
    }
    if (type === "acquisition") {
      return scoped.filter(
        (d) => (d.acquisition_source?.trim() || "(Unknown)") === side
      );
    }
    // store compare — side is store id or name
    const store =
      stores.find((s) => s.id === side) ??
      stores.find((s) => s.name === side);
    if (!store) return [];
    let list = scoped.filter((d) => d.store_id === store.id);
    if (slice && sliceType === "acquisition") {
      list = list.filter(
        (d) => (d.acquisition_source?.trim() || "(Unknown)") === slice
      );
    }
    if (slice && sliceType === "model") {
      const { make, model } = splitMakeModel(slice, list);
      list = list.filter(
        (d) => d.vehicle_make === make && d.vehicle_model === model
      );
    }
    return list;
  }

  const leftDeals = useMemo(() => sideDeals(a), [a, scoped, type, slice, sliceType, stores]);
  const rightDeals = useMemo(() => sideDeals(b), [b, scoped, type, slice, sliceType, stores]);
  const left = useMemo(
    () => metricsFor(leftDeals, tradesByDeal),
    [leftDeals, tradesByDeal]
  );
  const right = useMemo(
    () => metricsFor(rightDeals, tradesByDeal),
    [rightDeals, tradesByDeal]
  );

  const backHref = profitCenterHref({ preset, storeId, departmentName });

  function labelFor(side: string) {
    if (type === "store") {
      return (
        stores.find((s) => s.id === side)?.name ??
        stores.find((s) => s.name === side)?.name ??
        side
      );
    }
    return side;
  }

  function drillHref(side: string) {
    if (type === "model") {
      const { make, model } = splitMakeModel(side, deals);
      return modelCohortHref(make, model, { preset, storeId, departmentName });
    }
    if (type === "acquisition") {
      return cohortHref({
        focus: "acquisition",
        value: side,
        preset,
        storeId,
        departmentName,
      });
    }
    const store =
      stores.find((s) => s.id === side) ?? stores.find((s) => s.name === side);
    if (sliceType === "model" && slice) {
      const { make, model } = splitMakeModel(slice, deals);
      return modelCohortHref(make, model, {
        preset,
        storeId: store?.id ?? "all",
        departmentName,
      });
    }
    if (sliceType === "acquisition" && slice) {
      return cohortHref({
        focus: "acquisition",
        value: slice,
        preset,
        storeId: store?.id ?? "all",
        departmentName,
      });
    }
    return profitCenterHref({
      preset,
      storeId: store?.id ?? "all",
      departmentName,
    });
  }

  function setSide(which: "a" | "b", value: string) {
    const q = new URLSearchParams();
    q.set("type", type);
    q.set("a", which === "a" ? value : a);
    q.set("b", which === "b" ? value : b);
    if (slice) q.set("slice", slice);
    if (sliceType) q.set("sliceType", sliceType);
    q.set("preset", preset);
    if (storeId !== "all") q.set("store", storeId);
    if (departmentName !== "all") q.set("department", departmentName);
    router.replace(`/app/profit-center/compare?${q.toString()}`);
  }

  function setSlice(next: string) {
    const q = new URLSearchParams();
    q.set("type", type);
    q.set("a", a);
    q.set("b", b);
    q.set("preset", preset);
    if (storeId !== "all") q.set("store", storeId);
    if (departmentName !== "all") q.set("department", departmentName);
    if (next && next !== "all") {
      q.set("slice", next);
      q.set("sliceType", "acquisition");
    }
    router.replace(`/app/profit-center/compare?${q.toString()}`);
  }

  const acquisitionOptions = useMemo(() => {
    const set = new Set(
      deals.map((d) => d.acquisition_source?.trim() || "(Unknown)")
    );
    return [...set].sort();
  }, [deals]);

  return (
    <div className={cn("pc-command space-y-4")}>
      <header className="pc-head">
        <div>
          <p className="pc-kicker">
            <Link href={backHref} className="pc-link">
              ← Profit Center
            </Link>
          </p>
          <h1 className="pc-title">Compare</h1>
          <p className="pc-meta">
            {range.from === "2000-01-01"
              ? "All time"
              : `${range.from} → ${range.to}`}
            {slice ? ` · slice: ${slice}` : ""}
          </p>
        </div>
      </header>

      <div className="pc-compare-pickers">
        <label>
          A
          <select value={a} onChange={(e) => setSide("a", e.target.value)}>
            {optionsA.map((o) => (
              <option key={o} value={o}>
                {type === "store"
                  ? stores.find((s) => s.id === o)?.name ?? o
                  : o}
              </option>
            ))}
          </select>
        </label>
        <label>
          B
          <select value={b} onChange={(e) => setSide("b", e.target.value)}>
            {optionsB.map((o) => (
              <option key={o} value={o}>
                {type === "store"
                  ? stores.find((s) => s.id === o)?.name ?? o
                  : o}
              </option>
            ))}
          </select>
        </label>
        {type === "store" && (
          <label>
            Acquisition slice (optional)
            <select
              value={sliceType === "acquisition" && slice ? slice : "all"}
              onChange={(e) => setSlice(e.target.value)}
            >
              <option value="all">All sources</option>
              {acquisitionOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="pc-compare-heads">
        <div>
          <h2>{labelFor(a)}</h2>
          <p className="pc-muted">{left.volume} deals</p>
          <Link href={drillHref(a)} className="pc-link">
            View deals
          </Link>
        </div>
        <div>
          <h2>{labelFor(b)}</h2>
          <p className="pc-muted">{right.volume} deals</p>
          <Link href={drillHref(b)} className="pc-link">
            View deals
          </Link>
        </div>
      </div>

      <div className="pc-compare-grid">
        <MetricCard
          label="Avg front"
          left={left.avgFront}
          right={right.avgFront}
          format={pcFmt$}
        />
        <MetricCard
          label="Avg back"
          left={left.avgBack}
          right={right.avgBack}
          format={pcFmt$}
        />
        <MetricCard
          label="Avg total"
          left={left.avgTotal}
          right={right.avgTotal}
          format={pcFmt$}
        />
        <MetricCard
          label="Avg turn"
          left={left.avgAge}
          right={right.avgAge}
          format={(v) => (v == null ? "—" : `${pcFmtN(v, 0)}d`)}
          lowerIsBetter
        />
        <MetricCard
          label="Trade %"
          left={left.tradePct}
          right={right.tradePct}
          format={pcFmtPct}
        />
        <MetricCard
          label="Volume"
          left={left.volume}
          right={right.volume}
          format={(v) => (v == null ? "—" : String(v))}
        />
      </div>
      <p className="pc-footnote">
        Green highlight = better side (lower days wins for turn).
      </p>
    </div>
  );
}
