"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildSoldResults,
  buildSourceHealth,
  manualTagMap,
  NO_SOURCE_KEY,
  normStk,
  resolveAcqSource,
  unitMarkup,
  unitMatchesSourceKey,
  type SoldDeal,
  type TaggedMovement,
  type TaggedUnit,
} from "@/lib/inventory-command/acq-source";
import { FULL_PHOTO_COUNT } from "@/lib/inventory-command/config";
import { fmtMoney, fmtMoneyCompact, fmtNum, fmtPct } from "@/lib/inventory-command/format";
import { AGE_BUCKETS, ageBucket, IC, type AgeBucket } from "@/lib/inventory-command/midmo";
import type { InvDisposition, InvMovement, InvUnitDetailRow } from "@/lib/inventory-command/types";
import {
  getAllStoresSourceHealthAction,
  setInventoryAcqSourceAction,
  type AllStoresHealthPayload,
} from "../actions";
import InventoryUnitTable, { UNIT_COLUMNS } from "../ui/InventoryUnitTable";
import { IcEmpty, IcKpi, IcPanel } from "../ui/primitives";
import SoldResultsTable from "../ui/SoldResultsTable";
import SourceHealthTable from "../ui/SourceHealthTable";
import UnitDrawer from "../ui/UnitDrawer";

export type InventoryTabData = {
  sourceNames: string[];
  tags: { stk: string; source: string }[];
  recentMovements: InvMovement[];
  soldDeals: SoldDeal[];
  canTagSources: boolean;
};

type PhotoFilter = "all" | "full" | "temp" | "none";
type PriceFilter = "all" | "priced" | "unpriced";
type SoldWindow = 30 | 60 | 90;

const COLS_STORAGE_KEY = "ic-inventory-cols-v1";
const DEFAULT_COLS = new Set(UNIT_COLUMNS.filter((c) => c.defaultOn).map((c) => c.key));

/** Manual map with unsaved optimistic edits applied (null = manual tag removed). */
function withOverrides(base: Map<string, string>, overrides: Map<string, string | null>) {
  if (overrides.size === 0) return base;
  const out = new Map(base);
  for (const [stk, src] of overrides) {
    if (src == null) out.delete(stk);
    else out.set(stk, src);
  }
  return out;
}

export function tagUnits(
  units: InvUnitDetailRow[],
  ctx: {
    storeId: string;
    storeName: string;
    snapshotDate: string;
    manual: Map<string, string>;
    sourceNames: string[];
  }
): TaggedUnit[] {
  return units.map((u) => {
    const r = resolveAcqSource(u.stk, ctx.manual, ctx.sourceNames);
    return {
      ...u,
      storeId: ctx.storeId,
      storeName: ctx.storeName,
      snapshotDate: ctx.snapshotDate,
      source: r.source,
      sourceOrigin: r.origin,
      sourceNote: r.note,
    };
  });
}

function tagMovements(
  movements: InvMovement[],
  manual: Map<string, string>,
  sourceNames: string[]
): TaggedMovement[] {
  return movements.map((m) => ({
    ...m,
    source: resolveAcqSource(m.stk, manual, sourceNames).source,
  }));
}

function avgOf(nums: Array<number | null | undefined>): number | null {
  const vals = nums.filter((n): n is number => n != null && Number.isFinite(n));
  return vals.length ? vals.reduce((s, n) => s + n, 0) / vals.length : null;
}

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        borderRadius: 999,
        padding: "5px 11px",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        cursor: "pointer",
        border: active ? "1px solid #fff" : `1px solid ${IC.border}`,
        background: active ? "#fff" : IC.bg,
        color: active ? IC.darkText : IC.text,
      }}
    >
      {children}
    </button>
  );
}

const selectStyle: React.CSSProperties = {
  background: IC.bg,
  color: IC.text,
  border: `1px solid ${IC.border}`,
  borderRadius: 8,
  padding: "6px 8px",
  fontSize: 12,
};

export default function InventoryTab({
  units,
  storeId,
  storeName,
  storeCount,
  snapshotDate,
  data,
}: {
  units: InvUnitDetailRow[];
  storeId: string;
  storeName: string;
  storeCount: number;
  snapshotDate: string;
  data: InventoryTabData;
}) {
  const { sourceNames, tags, recentMovements, soldDeals, canTagSources } = data;

  const [overrides, setOverrides] = useState<Map<string, string | null>>(new Map());
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [tagError, setTagError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [ageFilter, setAgeFilter] = useState<AgeBucket | "all">("all");
  const [dispFilter, setDispFilter] = useState<InvDisposition | "all">("all");
  const [photoFilter, setPhotoFilter] = useState<PhotoFilter>("all");
  const [priceFilter, setPriceFilter] = useState<PriceFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkSource, setBulkSource] = useState("");
  const [visibleCols, setVisibleCols] = useState<Set<string>>(DEFAULT_COLS);
  const [showColPicker, setShowColPicker] = useState(false);
  const [drawerStk, setDrawerStk] = useState<string | null>(null);

  const [soldWindow, setSoldWindow] = useState<SoldWindow>(30);
  const [scope, setScope] = useState<"store" | "all">("store");
  const [splitByStore, setSplitByStore] = useState(false);
  const [allData, setAllData] = useState<AllStoresHealthPayload | null>(null);
  const [allLoading, setAllLoading] = useState(false);
  const [allError, setAllError] = useState<string | null>(null);

  // Saved tags arrive with the refreshed page props; drop the optimistic copies then.
  useEffect(() => {
    setOverrides(new Map());
  }, [tags]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(COLS_STORAGE_KEY);
      if (saved) {
        const keys = (JSON.parse(saved) as string[]).filter((k) =>
          UNIT_COLUMNS.some((c) => c.key === k)
        );
        if (keys.length > 0) setVisibleCols(new Set(keys));
      }
    } catch {
      // ignore bad saved state
    }
  }, []);

  function updateCols(next: Set<string>) {
    setVisibleCols(next);
    try {
      window.localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      // storage unavailable
    }
  }

  const baseManual = useMemo(() => manualTagMap(tags), [tags]);
  const manual = useMemo(() => withOverrides(baseManual, overrides), [baseManual, overrides]);

  const tagged = useMemo(
    () => tagUnits(units, { storeId, storeName, snapshotDate, manual, sourceNames }),
    [units, storeId, storeName, snapshotDate, manual, sourceNames]
  );

  const storeNames = useMemo(() => {
    const out: Record<string, string> = { [storeId]: storeName };
    for (const s of allData?.stores ?? []) out[s.id] = s.name;
    return out;
  }, [storeId, storeName, allData]);

  // --- Health + sold (this store or all stores) ---------------------------------
  const scoped = useMemo(() => {
    if (scope === "all" && allData) {
      const allUnits: TaggedUnit[] = [];
      const allMoves: TaggedMovement[] = [];
      const asOfByStore: Record<string, string> = {};
      for (const s of allData.stores) {
        const m =
          s.id === storeId ? manual : manualTagMap(s.tags);
        asOfByStore[s.id] = s.snapshotDate;
        allUnits.push(
          ...tagUnits(s.units, {
            storeId: s.id,
            storeName: s.name,
            snapshotDate: s.snapshotDate,
            manual: m,
            sourceNames: s.sourceNames,
          })
        );
        allMoves.push(
          ...tagMovements(
            allData.movements.filter((mv) => mv.store_id === s.id),
            m,
            s.sourceNames
          )
        );
      }
      return { units: allUnits, movements: allMoves, sold: allData.sold, asOfByStore };
    }
    return {
      units: tagged,
      movements: tagMovements(recentMovements, manual, sourceNames),
      sold: soldDeals,
      asOfByStore: { [storeId]: snapshotDate },
    };
  }, [scope, allData, storeId, manual, tagged, recentMovements, sourceNames, soldDeals, snapshotDate]);

  const split = scope === "all" && splitByStore;

  const health = useMemo(
    () =>
      buildSourceHealth(scoped.units, {
        movements: scoped.movements,
        sold: scoped.sold,
        soldWindowDays: soldWindow,
        asOfByStore: scoped.asOfByStore,
        splitByStore: split,
        storeNames,
      }),
    [scoped, soldWindow, split, storeNames]
  );

  const sold = useMemo(
    () =>
      buildSoldResults(scoped.sold, {
        windowDays: soldWindow,
        asOfByStore: scoped.asOfByStore,
        splitByStore: split,
        storeNames,
      }),
    [scoped, soldWindow, split, storeNames]
  );

  async function chooseScope(next: "store" | "all") {
    setScope(next);
    if (next === "all" && !allData && !allLoading) {
      setAllLoading(true);
      setAllError(null);
      const res = await getAllStoresSourceHealthAction();
      setAllLoading(false);
      if (res.ok) setAllData(res.data);
      else {
        setAllError(res.error);
        setScope("store");
      }
    }
  }

  // --- Unit table filtering -----------------------------------------------------
  const filtered = useMemo(() => {
    const tokens = search.toLowerCase().split(/\s+/).filter(Boolean);
    return tagged.filter((u) => {
      if (sourceFilter && !unitMatchesSourceKey(u, sourceFilter)) return false;
      if (ageFilter !== "all" && ageBucket(u.age) !== ageFilter) return false;
      if (dispFilter !== "all" && u.disp !== dispFilter) return false;
      const ph = u.ph ?? 0;
      if (photoFilter === "full" && ph < FULL_PHOTO_COUNT) return false;
      if (photoFilter === "temp" && (ph === 0 || ph >= FULL_PHOTO_COUNT)) return false;
      if (photoFilter === "none" && ph !== 0) return false;
      if (priceFilter === "priced" && u.price == null) return false;
      if (priceFilter === "unpriced" && u.price != null) return false;
      if (tokens.length) {
        const hay = [u.stk, u.vin, u.year, u.make, u.model, u.trim, u.body, u.veh, u.source]
          .filter((v) => v != null)
          .join(" ")
          .toLowerCase();
        if (!tokens.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
  }, [tagged, search, sourceFilter, ageFilter, dispFilter, photoFilter, priceFilter]);

  const untagged = tagged.filter((u) => !u.source).length;
  const drawerUnit = drawerStk ? tagged.find((u) => u.stk === drawerStk) ?? null : null;

  // --- Tagging -------------------------------------------------------------------
  const setSource = useCallback(
    async (stks: string[], source: string | null) => {
      if (!canTagSources || stks.length === 0) return;
      setTagError(null);
      const keys = stks.map(normStk);
      setOverrides((prev) => {
        const next = new Map(prev);
        for (const k of keys) next.set(k, source);
        return next;
      });
      setSaving((prev) => new Set([...prev, ...stks]));
      const res = await setInventoryAcqSourceAction({ storeId, stks, source });
      setSaving((prev) => {
        const next = new Set(prev);
        for (const s of stks) next.delete(s);
        return next;
      });
      if (!res.ok) {
        setTagError(res.error);
        setOverrides((prev) => {
          const next = new Map(prev);
          for (const k of keys) next.delete(k);
          return next;
        });
      }
    },
    [canTagSources, storeId]
  );

  async function applyBulk() {
    if (!bulkSource || selected.size === 0) return;
    const stks = [...selected];
    await setSource(stks, bulkSource === "__revert" ? null : bulkSource);
    setSelected(new Set());
    setBulkSource("");
  }

  function exportCsv() {
    const header = ["Stock #", "Source", "Source Set By", ...UNIT_COLUMNS.filter((c) => c.key !== "stk").map((c) => c.label)];
    const lines = [header.map(csvCell).join(",")];
    for (const u of filtered) {
      lines.push(
        [
          u.stk,
          u.source ?? "",
          u.sourceOrigin === "manual" ? "Manual" : u.sourceOrigin === "auto" ? "Stock # rule" : "",
          ...UNIT_COLUMNS.filter((c) => c.key !== "stk").map((c) => c.value(u)),
        ]
          .map(csvCell)
          .join(",")
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory-${storeName.replace(/\s+/g, "-").toLowerCase()}-${snapshotDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function clearFilters() {
    setSearch("");
    setSourceFilter(null);
    setAgeFilter("all");
    setDispFilter("all");
    setPhotoFilter("all");
    setPriceFilter("all");
  }

  if (units.length === 0) {
    return <IcEmpty>No units in this store&apos;s latest snapshot.</IcEmpty>;
  }

  const totalCost = tagged.reduce((s, u) => s + (u.cost ?? 0), 0);
  const avgAge = avgOf(tagged.map((u) => u.age));
  const avgPom = avgOf(tagged.map((u) => u.pom));
  const avgCtm = avgOf(tagged.map((u) => u.ctm_pct));
  const avgMarkup = avgOf(tagged.map(unitMarkup));
  const hasDetail = tagged.some((u) => u.vin != null || u.ctm_pct != null || u.odometer != null);
  const sourceFilterLabel =
    sourceFilter == null
      ? null
      : sourceFilter === NO_SOURCE_KEY
        ? "Untagged"
        : health.rows.find((r) => r.key.split("::")[0] === sourceFilter)?.label ?? sourceFilter;
  const filtersActive =
    search !== "" ||
    sourceFilter != null ||
    ageFilter !== "all" ||
    dispFilter !== "all" ||
    photoFilter !== "all" ||
    priceFilter !== "all";

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2.5">
        <IcKpi label="Units" value={fmtNum(tagged.length)} sub={`${fmtMoneyCompact(totalCost)} at cost`} />
        <button
          type="button"
          onClick={() => setSourceFilter(untagged > 0 ? NO_SOURCE_KEY : null)}
          style={{ flex: 1, minWidth: 130, textAlign: "left", padding: 0, background: "none", border: "none" }}
        >
          <IcKpi
            label="Needs source tag"
            value={fmtNum(untagged)}
            sub={untagged > 0 ? "click to show them" : "every unit tagged"}
            status={untagged > 0 ? "warn" : "ok"}
          />
        </button>
        <IcKpi
          label="Avg age"
          value={avgAge == null ? "—" : `${fmtNum(avgAge, 0)}d`}
          sub="days in stock"
        />
        <IcKpi label="Avg markup" value={fmtMoney(avgMarkup)} sub="price − cost" />
        <IcKpi label="Avg % of market" value={fmtPct(avgPom, 1)} sub="adjusted, vAuto" />
        <IcKpi
          label="Avg cost to market"
          value={fmtPct(avgCtm, 1)}
          sub={hasDetail ? "adjusted, vAuto" : "re-upload export to fill"}
        />
      </div>

      {!hasDetail ? (
        <p className="mb-4 rounded-lg px-3 py-2 text-xs" style={{ background: IC.panel, color: IC.yellow, border: `1px solid ${IC.border}` }}>
          This snapshot was uploaded before VIN, miles, cost-to-market, and Black Book were saved.
          Re-upload today&apos;s vAuto export to fill them in.
        </p>
      ) : null}

      <IcPanel
        title="Inventory health by acquisition source"
        note="click a source to filter the units below"
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {storeCount > 1 ? (
            <>
              <Pill active={scope === "store"} onClick={() => chooseScope("store")}>
                This store
              </Pill>
              <Pill active={scope === "all"} onClick={() => chooseScope("all")}>
                {allLoading ? "Loading…" : "All stores"}
              </Pill>
              {scope === "all" ? (
                <label className="ml-1 inline-flex items-center gap-1.5 text-xs" style={{ color: IC.muted }}>
                  <input
                    type="checkbox"
                    checked={splitByStore}
                    onChange={(e) => setSplitByStore(e.target.checked)}
                  />
                  Split by store
                </label>
              ) : null}
              <span style={{ width: 12 }} />
            </>
          ) : null}
          <span className="text-xs" style={{ color: IC.muted }}>
            Sold window
          </span>
          {([30, 60, 90] as const).map((d) => (
            <Pill key={d} active={soldWindow === d} onClick={() => setSoldWindow(d)}>
              {d}d
            </Pill>
          ))}
        </div>
        {allError ? (
          <p className="mb-2 text-xs" style={{ color: IC.red }}>
            {allError}
          </p>
        ) : null}
        <SourceHealthTable
          rows={health.rows}
          total={health.total}
          soldWindowDays={soldWindow}
          showStore={split}
          activeKey={
            sourceFilter == null
              ? null
              : health.rows.find((r) => r.key.split("::")[0] === sourceFilter)?.key ?? null
          }
          onSelect={(r) => {
            const key = r.key.split("::")[0]!;
            setSourceFilter((prev) => (prev === key ? null : key));
          }}
        />
        <p className="mt-2 text-[11px] leading-relaxed" style={{ color: IC.muted }}>
          Markup % = total markup ÷ total cost. Cost to Mkt = vAuto adjusted cost to market (lower
          is better). In/Out 30d = arrivals and exits from daily uploads. Days supply = units ÷
          (Pre-Owned deals closed per day over the sold window). Sold / Stock = closed deals in the
          window ÷ units on hand.
          {scope === "all" ? " The unit list below stays on the selected store." : ""}
        </p>
      </IcPanel>

      <IcPanel
        title={`Sold results by source · last ${soldWindow} days`}
        note="closed Pre-Owned deals, by the deal's acquisition source"
      >
        {sold.rows.length === 0 ? (
          <p className="text-sm" style={{ color: IC.muted }}>
            No closed Pre-Owned deals in the last {soldWindow} days.
          </p>
        ) : (
          <SoldResultsTable rows={sold.rows} total={sold.total} showStore={split} />
        )}
      </IcPanel>

      <IcPanel
        title={`All inventory · ${fmtNum(filtered.length)} of ${fmtNum(tagged.length)}`}
        note="click a row for every column from the upload"
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search stock #, VIN, year, make, model, trim…"
            style={{ ...selectStyle, minWidth: 280, flex: "1 1 280px", padding: "8px 10px", fontSize: 13 }}
          />
          <select
            value={sourceFilter ?? ""}
            onChange={(e) => setSourceFilter(e.target.value || null)}
            style={selectStyle}
            aria-label="Filter by source"
          >
            <option value="">All sources</option>
            <option value={NO_SOURCE_KEY}>Untagged</option>
            {[...new Set(tagged.map((u) => u.source).filter((s): s is string => !!s))]
              .sort()
              .map((s) => (
                <option key={s} value={s.toLowerCase()}>
                  {s}
                </option>
              ))}
          </select>
          <select
            value={ageFilter}
            onChange={(e) => setAgeFilter(e.target.value as AgeBucket | "all")}
            style={selectStyle}
            aria-label="Filter by age"
          >
            <option value="all">All ages</option>
            {AGE_BUCKETS.map((b) => (
              <option key={b} value={b}>
                {b} days
              </option>
            ))}
          </select>
          <select
            value={dispFilter}
            onChange={(e) => setDispFilter(e.target.value as InvDisposition | "all")}
            style={selectStyle}
            aria-label="Filter by disposition"
          >
            <option value="all">All dispositions</option>
            <option value="retail">Retail</option>
            <option value="subprime">Subprime</option>
            <option value="wholesale">Wholesale</option>
          </select>
          <select
            value={photoFilter}
            onChange={(e) => setPhotoFilter(e.target.value as PhotoFilter)}
            style={selectStyle}
            aria-label="Filter by photos"
          >
            <option value="all">All photos</option>
            <option value="full">Full set ({FULL_PHOTO_COUNT}+)</option>
            <option value="temp">Temp set</option>
            <option value="none">No photos</option>
          </select>
          <select
            value={priceFilter}
            onChange={(e) => setPriceFilter(e.target.value as PriceFilter)}
            style={selectStyle}
            aria-label="Filter by price"
          >
            <option value="all">Priced + unpriced</option>
            <option value="priced">Priced</option>
            <option value="unpriced">No price</option>
          </select>
          {filtersActive ? (
            <button type="button" onClick={clearFilters} style={{ ...selectStyle, cursor: "pointer" }}>
              Clear
            </button>
          ) : null}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowColPicker((v) => !v)}
              style={{ ...selectStyle, cursor: "pointer" }}
            >
              Columns ({visibleCols.size})
            </button>
            {showColPicker ? (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "110%",
                  zIndex: 20,
                  background: IC.panel,
                  border: `1px solid ${IC.border}`,
                  borderRadius: 8,
                  padding: 10,
                  width: 240,
                  maxHeight: 360,
                  overflowY: "auto",
                }}
              >
                {UNIT_COLUMNS.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 py-0.5 text-xs" style={{ color: IC.text }}>
                    <input
                      type="checkbox"
                      checked={visibleCols.has(c.key)}
                      onChange={(e) => {
                        const next = new Set(visibleCols);
                        if (e.target.checked) next.add(c.key);
                        else next.delete(c.key);
                        updateCols(next);
                      }}
                    />
                    {c.label}
                  </label>
                ))}
                <button
                  type="button"
                  onClick={() => updateCols(new Set(DEFAULT_COLS))}
                  className="mt-2 text-xs underline"
                  style={{ color: IC.muted }}
                >
                  Reset to default
                </button>
              </div>
            ) : null}
          </div>
          <button type="button" onClick={exportCsv} style={{ ...selectStyle, cursor: "pointer" }}>
            Export CSV
          </button>
        </div>

        {sourceFilterLabel ? (
          <p className="mb-2 text-xs" style={{ color: IC.muted }}>
            Showing source: <strong style={{ color: IC.text }}>{sourceFilterLabel}</strong>
          </p>
        ) : null}

        {canTagSources && selected.size > 0 ? (
          <div
            className="mb-3 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2"
            style={{ background: IC.bg, border: `1px solid ${IC.yellow}` }}
          >
            <span className="text-xs font-semibold" style={{ color: IC.yellow }}>
              {selected.size} selected
            </span>
            <select
              value={bulkSource}
              onChange={(e) => setBulkSource(e.target.value)}
              style={selectStyle}
              aria-label="Source for selected units"
            >
              <option value="">Set source to…</option>
              {sourceNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              <option value="__revert">↺ Revert to stock # rule</option>
            </select>
            <button
              type="button"
              onClick={applyBulk}
              disabled={!bulkSource}
              style={{
                ...selectStyle,
                cursor: bulkSource ? "pointer" : "not-allowed",
                background: bulkSource ? IC.yellow : IC.bg,
                color: bulkSource ? IC.darkText : IC.muted,
                fontWeight: 700,
              }}
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs underline"
              style={{ color: IC.muted }}
            >
              Clear selection
            </button>
          </div>
        ) : null}

        {tagError ? (
          <p className="mb-2 text-xs" style={{ color: IC.red }}>
            {tagError}
          </p>
        ) : null}

        <InventoryUnitTable
          units={filtered}
          sourceNames={sourceNames}
          canTag={canTagSources}
          visibleCols={visibleCols}
          selected={selected}
          savingStks={saving}
          onToggleSelect={(stk) =>
            setSelected((prev) => {
              const next = new Set(prev);
              if (next.has(stk)) next.delete(stk);
              else next.add(stk);
              return next;
            })
          }
          onToggleSelectAll={(on) =>
            setSelected((prev) => {
              const next = new Set(prev);
              for (const u of filtered) {
                if (on) next.add(u.stk);
                else next.delete(u.stk);
              }
              return next;
            })
          }
          onSetSource={setSource}
          onOpenUnit={(u) => setDrawerStk(u.stk)}
        />
        <p className="mt-2 text-[11px] leading-relaxed" style={{ color: IC.muted }}>
          Source rules: 6 digits + A/AA = New Car Trade · 6 digits + B or later = Used Car Trade ·
          DH + 4 digits = Dylan Purchase · DH/CP/4-digit ending in a letter = Used Car Trade · CP +
          4 digits and plain 4-digit stocks need a manual tag. A C prefix on 6-digit stocks follows
          the same trade rules. Manual tags win and are kept forever until changed.
        </p>
      </IcPanel>

      <UnitDrawer unit={drawerUnit} onClose={() => setDrawerStk(null)} />
    </div>
  );
}
