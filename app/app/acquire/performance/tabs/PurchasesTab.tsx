"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  adjPctOfMarket,
  allInCost,
  costMinusPurchase,
  currentJd,
  currentMmr,
  daysBetween,
  daysSincePriceChange,
  displayAgeDays,
  effectiveGross,
  frontlineAgeDays,
  jdDelta,
  markup,
  merchCost,
  mmrDelta,
  reconVariance,
  websitePrice,
} from "@/lib/acquire/cost";
import {
  ACQ_SOURCE_LABELS,
  ACQ_STAGE_LABELS,
  ACQ_EXIT_STRATEGY_LABELS,
  type AcqPurchase,
} from "@/lib/acquire/types";
import { exitOf, sellerKey } from "@/lib/acquire/performance-analytics";
import { storePillLabel, fmt$, fmtN, fmtPct } from "@/app/app/profit-center/format";

type ColKey =
  | "stock_number"
  | "age"
  | "year"
  | "make"
  | "model"
  | "trim"
  | "odometer"
  | "cr_grade"
  | "source"
  | "seller"
  | "store"
  | "buyer"
  | "stage"
  | "on_hold"
  | "exit"
  | "purchase_date"
  | "sold_date"
  | "recon_estimate"
  | "recon_actual"
  | "recon_diff"
  | "days_in_recon"
  | "time_to_line"
  | "frontline_age"
  | "days_since_price"
  | "photos"
  | "pom"
  | "mmr"
  | "mmr_diff"
  | "jd"
  | "jd_diff"
  | "purchase_price"
  | "auction_fees"
  | "transport"
  | "all_in"
  | "cost"
  | "cost_minus_purchase"
  | "price"
  | "markup"
  | "front"
  | "back"
  | "gross";

type Ctx = {
  storeName: (id: string | null) => string;
  buyerName: (id: string | null) => string;
};

type ColDef = {
  key: ColKey;
  label: string;
  display: (p: AcqPurchase, ctx: Ctx) => string;
  sort: (p: AcqPurchase, ctx: Ctx) => string | number;
  tone?: (p: AcqPurchase) => string | undefined;
};

function exitLabel(p: AcqPurchase): string {
  const e = exitOf(p);
  if (!e) return "—";
  return ACQ_EXIT_STRATEGY_LABELS[e] ?? e;
}

function signed$(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const base = fmt$(n);
  return n > 0 ? `+${base}` : base;
}

function daysLabel(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${fmtN(n, 0)}d`;
}

function moneyTone(n: number | null | undefined, invert = false): string | undefined {
  if (n == null || n === 0) return undefined;
  const good = invert ? n < 0 : n > 0;
  return good ? "var(--da-green)" : "var(--da-red)";
}

/** Over estimate / higher cost vs purchase = bad (red). */
function costTone(n: number | null | undefined): string | undefined {
  if (n == null || n === 0) return undefined;
  return n > 0 ? "var(--da-red)" : "var(--da-green)";
}

const COLUMNS: ColDef[] = [
  {
    key: "stock_number",
    label: "Stock",
    display: (p) => p.stock_number?.trim() || "—",
    sort: (p) => (p.stock_number ?? "").toLowerCase(),
  },
  {
    key: "age",
    label: "Age",
    display: (p) => daysLabel(displayAgeDays(p)),
    sort: (p) => displayAgeDays(p) ?? -Infinity,
  },
  {
    key: "year",
    label: "Year",
    display: (p) => (p.vehicle_year != null ? String(p.vehicle_year) : "—"),
    sort: (p) => p.vehicle_year ?? -Infinity,
  },
  {
    key: "make",
    label: "Make",
    display: (p) => p.vehicle_make?.trim() || "—",
    sort: (p) => (p.vehicle_make ?? "").toLowerCase(),
  },
  {
    key: "model",
    label: "Model",
    display: (p) => p.vehicle_model?.trim() || "—",
    sort: (p) => (p.vehicle_model ?? "").toLowerCase(),
  },
  {
    key: "trim",
    label: "Trim",
    display: (p) => p.vehicle_trim?.trim() || "—",
    sort: (p) => (p.vehicle_trim ?? "").toLowerCase(),
  },
  {
    key: "odometer",
    label: "Odo",
    display: (p) => (p.odometer == null ? "—" : fmtN(p.odometer, 0)),
    sort: (p) => p.odometer ?? -Infinity,
  },
  {
    key: "cr_grade",
    label: "CR",
    display: (p) => p.cr_grade?.trim() || "—",
    sort: (p) => (p.cr_grade ?? "").toLowerCase(),
  },
  {
    key: "source",
    label: "Source",
    display: (p) => ACQ_SOURCE_LABELS[p.source_type] ?? p.source_type,
    sort: (p) => ACQ_SOURCE_LABELS[p.source_type] ?? p.source_type,
  },
  {
    key: "seller",
    label: "Seller",
    display: (p) => sellerKey(p),
    sort: (p) => sellerKey(p).toLowerCase(),
  },
  {
    key: "store",
    label: "Store",
    display: (p, ctx) => storePillLabel(ctx.storeName(p.store_id)),
    sort: (p, ctx) => ctx.storeName(p.store_id).toLowerCase(),
  },
  {
    key: "buyer",
    label: "Buyer",
    display: (p, ctx) => ctx.buyerName(p.buyer_id),
    sort: (p, ctx) => ctx.buyerName(p.buyer_id).toLowerCase(),
  },
  {
    key: "stage",
    label: "Status",
    display: (p) => ACQ_STAGE_LABELS[p.stage] ?? p.stage,
    sort: (p) => ACQ_STAGE_LABELS[p.stage] ?? p.stage,
  },
  {
    key: "on_hold",
    label: "On hold",
    display: (p) => (p.on_hold ? "Yes" : "No"),
    sort: (p) => (p.on_hold ? 1 : 0),
    tone: (p) => (p.on_hold ? "var(--da-amber)" : undefined),
  },
  {
    key: "exit",
    label: "Exit",
    display: (p) => exitLabel(p),
    sort: (p) => exitLabel(p).toLowerCase(),
  },
  {
    key: "purchase_date",
    label: "Purchased",
    display: (p) => p.purchase_date ?? "—",
    sort: (p) => p.purchase_date ?? "",
  },
  {
    key: "sold_date",
    label: "Sold",
    display: (p) => p.sold_date ?? "—",
    sort: (p) => p.sold_date ?? "",
  },
  {
    key: "recon_estimate",
    label: "Recon est",
    display: (p) => fmt$(p.recon_estimate),
    sort: (p) => p.recon_estimate ?? -Infinity,
  },
  {
    key: "recon_actual",
    label: "Actual recon",
    display: (p) => fmt$(p.recon_cost),
    sort: (p) => p.recon_cost ?? -Infinity,
  },
  {
    key: "recon_diff",
    label: "Recon Δ",
    display: (p) => signed$(reconVariance(p)),
    sort: (p) => reconVariance(p) ?? -Infinity,
    tone: (p) => costTone(reconVariance(p)),
  },
  {
    key: "days_in_recon",
    label: "Days in recon",
    display: (p) =>
      daysLabel(daysBetween(p.delivery_date, p.frontline_date)),
    sort: (p) =>
      daysBetween(p.delivery_date, p.frontline_date) ?? -Infinity,
  },
  {
    key: "time_to_line",
    label: "Time to line",
    display: (p) =>
      daysLabel(daysBetween(p.purchase_date, p.frontline_date)),
    sort: (p) =>
      daysBetween(p.purchase_date, p.frontline_date) ?? -Infinity,
  },
  {
    key: "frontline_age",
    label: "Frontline age",
    display: (p) => daysLabel(frontlineAgeDays(p)),
    sort: (p) => frontlineAgeDays(p) ?? -Infinity,
  },
  {
    key: "days_since_price",
    label: "Days since $ Δ",
    display: (p) => daysLabel(daysSincePriceChange(p)),
    sort: (p) => daysSincePriceChange(p) ?? -Infinity,
  },
  {
    key: "photos",
    label: "Photos",
    display: (p) =>
      p.live_photo_count == null ? "—" : fmtN(p.live_photo_count, 0),
    sort: (p) => p.live_photo_count ?? -Infinity,
  },
  {
    key: "pom",
    label: "% of mkt",
    display: (p) => {
      const pom = adjPctOfMarket(p);
      return pom == null ? "—" : fmtPct(pom);
    },
    sort: (p) => adjPctOfMarket(p) ?? -Infinity,
  },
  {
    key: "mmr",
    label: "MMR",
    display: (p) => fmt$(currentMmr(p)),
    sort: (p) => currentMmr(p) ?? -Infinity,
  },
  {
    key: "mmr_diff",
    label: "MMR Δ",
    display: (p) => signed$(mmrDelta(p)),
    sort: (p) => mmrDelta(p) ?? -Infinity,
    tone: (p) => moneyTone(mmrDelta(p)),
  },
  {
    key: "jd",
    label: "JD Clean Trade",
    display: (p) => fmt$(currentJd(p)),
    sort: (p) => currentJd(p) ?? -Infinity,
  },
  {
    key: "jd_diff",
    label: "JD Δ",
    display: (p) => signed$(jdDelta(p)),
    sort: (p) => jdDelta(p) ?? -Infinity,
    tone: (p) => moneyTone(jdDelta(p)),
  },
  {
    key: "purchase_price",
    label: "Purchase $",
    display: (p) => fmt$(p.purchase_price),
    sort: (p) => p.purchase_price ?? -Infinity,
  },
  {
    key: "auction_fees",
    label: "Auction fees",
    display: (p) => fmt$(p.auction_fees),
    sort: (p) => p.auction_fees ?? -Infinity,
  },
  {
    key: "transport",
    label: "Transport",
    display: (p) => fmt$(p.transport_cost),
    sort: (p) => p.transport_cost ?? -Infinity,
  },
  {
    key: "all_in",
    label: "All-in",
    display: (p) => fmt$(allInCost(p)),
    sort: (p) => allInCost(p) ?? -Infinity,
  },
  {
    key: "cost",
    label: "Cost",
    display: (p) => fmt$(merchCost(p)),
    sort: (p) => merchCost(p) ?? -Infinity,
  },
  {
    key: "cost_minus_purchase",
    label: "Cost − purch",
    display: (p) => signed$(costMinusPurchase(p)),
    sort: (p) => costMinusPurchase(p) ?? -Infinity,
    tone: (p) => costTone(costMinusPurchase(p)),
  },
  {
    key: "price",
    label: "Price",
    display: (p) => fmt$(websitePrice(p)),
    sort: (p) => websitePrice(p) ?? -Infinity,
  },
  {
    key: "markup",
    label: "Markup",
    display: (p) => signed$(markup(p)),
    sort: (p) => markup(p) ?? -Infinity,
    tone: (p) => moneyTone(markup(p)),
  },
  {
    key: "front",
    label: "Front",
    display: (p) => fmt$(p.front_gross),
    sort: (p) => p.front_gross ?? -Infinity,
    tone: (p) => moneyTone(p.front_gross),
  },
  {
    key: "back",
    label: "Back",
    display: (p) => fmt$(p.back_gross),
    sort: (p) => p.back_gross ?? -Infinity,
    tone: (p) => moneyTone(p.back_gross),
  },
  {
    key: "gross",
    label: "Total",
    display: (p) => fmt$(effectiveGross(p)),
    sort: (p) => effectiveGross(p) ?? -Infinity,
    tone: (p) => moneyTone(effectiveGross(p)),
  },
];

/** null = no filter (all values). Set = only these display values. */
type ColumnFilters = Partial<Record<ColKey, Set<string> | null>>;

function HeaderFilter({
  label,
  colKey,
  options,
  selected,
  active,
  sortMark,
  open,
  onToggleOpen,
  onSort,
  onChange,
}: {
  label: string;
  colKey: ColKey;
  options: string[];
  selected: Set<string> | null;
  active: boolean;
  sortMark: string;
  open: boolean;
  onToggleOpen: () => void;
  onSort: () => void;
  onChange: (next: Set<string> | null) => void;
}) {
  const rootRef = useRef<HTMLTableCellElement>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Set<string>>(() => new Set(options));

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setDraft(selected ? new Set(selected) : new Set(options));
  }, [open, selected, options]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) onToggleOpen();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onToggleOpen();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onToggleOpen]);

  const visibleOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter((o) => o.toLowerCase().includes(needle));
  }, [options, query]);

  const allChecked = options.length > 0 && options.every((o) => draft.has(o));
  const someChecked = options.some((o) => draft.has(o));

  function toggleValue(value: string) {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function selectAllVisible() {
    setDraft((prev) => {
      const next = new Set(prev);
      for (const o of visibleOptions) next.add(o);
      return next;
    });
  }

  function clearVisible() {
    setDraft((prev) => {
      const next = new Set(prev);
      for (const o of visibleOptions) next.delete(o);
      return next;
    });
  }

  function apply() {
    if (draft.size === 0) onChange(new Set());
    else if (draft.size === options.length) onChange(null);
    else onChange(new Set(draft));
    onToggleOpen();
  }

  return (
    <th ref={rootRef} style={{ position: "relative" }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          maxWidth: "100%",
        }}
      >
        <button type="button" className="pc-sort" onClick={onSort}>
          {label}
          {sortMark}
        </button>
        <button
          type="button"
          aria-label={`Filter ${label}`}
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation();
            onToggleOpen();
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 18,
            height: 18,
            borderRadius: 4,
            border: active
              ? "1px solid var(--da-amber)"
              : "1px solid transparent",
            background: active ? "rgba(245, 194, 66, 0.18)" : "transparent",
            color: active ? "var(--da-amber)" : "var(--da-muted)",
            cursor: "pointer",
            padding: 0,
            flexShrink: 0,
          }}
        >
          <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
            <path
              fill="currentColor"
              d="M1 2h10L7.2 6.5V10l-2.4 1.2V6.5L1 2z"
            />
          </svg>
        </button>
      </div>

      {open ? (
        <div
          role="dialog"
          aria-label={`Filter ${label}`}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            zIndex: 40,
            width: 260,
            marginTop: 4,
            padding: 10,
            borderRadius: 10,
            border: "1px solid var(--da-line)",
            background: "var(--da-panel)",
            boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
            textAlign: "left",
            whiteSpace: "normal",
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search values…"
            autoFocus
            style={{
              width: "100%",
              height: 32,
              marginBottom: 8,
              padding: "0 10px",
              borderRadius: 8,
              border: "1px solid var(--da-line)",
              background: "var(--da-bg)",
              color: "var(--da-text)",
              fontSize: 12,
            }}
          />
          <div style={{ display: "flex", gap: 8, marginBottom: 8, fontSize: 11 }}>
            <button type="button" className="pc-link" onClick={selectAllVisible}>
              Select all
            </button>
            <button type="button" className="pc-link" onClick={clearVisible}>
              Clear
            </button>
            {active ? (
              <button
                type="button"
                className="pc-link"
                onClick={() => {
                  onChange(null);
                  onToggleOpen();
                }}
              >
                Reset column
              </button>
            ) : null}
          </div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 2px 8px",
              borderBottom: "1px solid var(--da-line)",
              marginBottom: 6,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={allChecked}
              ref={(el) => {
                if (el) el.indeterminate = !allChecked && someChecked;
              }}
              onChange={() => {
                if (allChecked) clearVisible();
                else selectAllVisible();
              }}
            />
            (Select all)
          </label>
          <div
            style={{
              maxHeight: 220,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 2,
            }}
          >
            {visibleOptions.length === 0 ? (
              <p className="pc-muted" style={{ margin: "8px 0", fontSize: 12 }}>
                No matching values
              </p>
            ) : (
              visibleOptions.map((value) => (
                <label
                  key={value}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    padding: "4px 2px",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={draft.has(value)}
                    onChange={() => toggleValue(value)}
                    style={{ marginTop: 2 }}
                  />
                  <span style={{ wordBreak: "break-word" }}>{value}</span>
                </label>
              ))
            )}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              marginTop: 10,
              paddingTop: 8,
              borderTop: "1px solid var(--da-line)",
            }}
          >
            <button
              type="button"
              className="pc-pill is-soft"
              onClick={onToggleOpen}
            >
              Cancel
            </button>
            <button
              type="button"
              className="pc-pill is-soft is-active"
              onClick={apply}
            >
              Apply
            </button>
          </div>
        </div>
      ) : null}
    </th>
  );
}

export default function PurchasesTab({
  purchases,
  stores,
  buyers,
}: {
  purchases: AcqPurchase[];
  stores: { id: string; name: string }[];
  buyers: { id: string; name: string }[];
}) {
  const storeName = useMemo(() => {
    const m = new Map(stores.map((s) => [s.id, s.name]));
    return (id: string | null) => (id ? m.get(id) ?? "—" : "Unassigned");
  }, [stores]);

  const buyerName = useMemo(() => {
    const m = new Map(buyers.map((b) => [b.id, b.name]));
    return (id: string | null) => (id ? m.get(id) ?? "—" : "—");
  }, [buyers]);

  const ctx: Ctx = useMemo(
    () => ({ storeName, buyerName }),
    [storeName, buyerName]
  );

  const [q, setQ] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({});
  const [openFilter, setOpenFilter] = useState<ColKey | null>(null);
  const [sortKey, setSortKey] = useState<ColKey>("purchase_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const searchFiltered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return purchases;
    return purchases.filter((p) => {
      const hay = [
        p.stock_number,
        p.vehicle_year,
        p.vehicle_make,
        p.vehicle_model,
        p.vehicle_trim,
        p.cr_grade,
        sellerKey(p),
        storeName(p.store_id),
        buyerName(p.buyer_id),
        ACQ_STAGE_LABELS[p.stage],
        p.on_hold ? "hold" : "",
        exitLabel(p),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [purchases, q, storeName, buyerName]);

  const filtered = useMemo(() => {
    return searchFiltered.filter((p) => {
      for (const col of COLUMNS) {
        const selected = columnFilters[col.key];
        if (!selected) continue;
        if (!selected.has(col.display(p, ctx))) return false;
      }
      return true;
    });
  }, [searchFiltered, columnFilters, ctx]);

  const optionLists = useMemo(() => {
    const lists = {} as Record<ColKey, string[]>;
    for (const col of COLUMNS) {
      const base = searchFiltered.filter((p) => {
        for (const other of COLUMNS) {
          if (other.key === col.key) continue;
          const selected = columnFilters[other.key];
          if (!selected) continue;
          if (!selected.has(other.display(p, ctx))) return false;
        }
        return true;
      });
      const set = new Set<string>();
      for (const p of base) set.add(col.display(p, ctx));
      lists[col.key] = Array.from(set).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
      );
    }
    return lists;
  }, [searchFiltered, columnFilters, ctx]);

  const sorted = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sortKey) ?? COLUMNS[0]!;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = col.sort(a, ctx);
      const bv = col.sort(b, ctx);
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return copy;
  }, [filtered, sortKey, sortDir, ctx]);

  const activeFilterCount = useMemo(() => {
    return COLUMNS.reduce((n, c) => (columnFilters[c.key] ? n + 1 : n), 0);
  }, [columnFilters]);

  function toggleSort(k: ColKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      const numericDefaults: ColKey[] = [
        "age",
        "year",
        "odometer",
        "on_hold",
        "purchase_date",
        "sold_date",
        "recon_estimate",
        "recon_actual",
        "recon_diff",
        "days_in_recon",
        "time_to_line",
        "frontline_age",
        "days_since_price",
        "photos",
        "pom",
        "mmr",
        "mmr_diff",
        "jd",
        "jd_diff",
        "purchase_price",
        "auction_fees",
        "transport",
        "all_in",
        "cost",
        "cost_minus_purchase",
        "price",
        "markup",
        "front",
        "back",
        "gross",
      ];
      setSortDir(numericDefaults.includes(k) ? "desc" : "asc");
    }
  }

  function mark(k: ColKey) {
    return sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : "";
  }

  function setColumnFilter(key: ColKey, next: Set<string> | null) {
    setColumnFilters((prev) => {
      const copy = { ...prev };
      if (next == null) delete copy[key];
      else copy[key] = next;
      return copy;
    });
  }

  return (
    <section className="pc-stocking">
      <div className="pc-buybox-head">
        <h2>All-time purchases</h2>
        <p>
          {sorted.length.toLocaleString()} of {purchases.length.toLocaleString()}{" "}
          rows · not filtered by date preset
          {activeFilterCount > 0
            ? ` · ${activeFilterCount} column filter${activeFilterCount === 1 ? "" : "s"}`
            : ""}
        </p>
      </div>

      <div
        className="pc-filters"
        style={{
          marginBottom: 14,
          gridTemplateColumns: "minmax(220px, 1fr) auto",
          alignItems: "center",
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search stock, VIN, YMM, seller, buyer…"
          aria-label="Search purchases"
        />
        {activeFilterCount > 0 ? (
          <button
            type="button"
            className="pc-pill is-soft"
            onClick={() => {
              setColumnFilters({});
              setOpenFilter(null);
            }}
          >
            Clear column filters
          </button>
        ) : (
          <span className="pc-muted" style={{ fontSize: 12 }}>
            Use ▾ on a column header to filter values
          </span>
        )}
      </div>

      <div className="pc-table-wrap" style={{ overflow: "visible" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="pc-table" style={{ minWidth: 3200 }}>
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <HeaderFilter
                    key={col.key}
                    label={col.label}
                    colKey={col.key}
                    options={optionLists[col.key]}
                    selected={columnFilters[col.key] ?? null}
                    active={Boolean(columnFilters[col.key])}
                    sortMark={mark(col.key)}
                    open={openFilter === col.key}
                    onToggleOpen={() =>
                      setOpenFilter((cur) =>
                        cur === col.key ? null : col.key
                      )
                    }
                    onSort={() => toggleSort(col.key)}
                    onChange={(next) => setColumnFilter(col.key, next)}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={COLUMNS.length}
                    style={{ textAlign: "center", color: "var(--da-muted)" }}
                  >
                    No purchases match these filters.
                  </td>
                </tr>
              ) : (
                sorted.map((p) => (
                  <tr key={p.id}>
                    {COLUMNS.map((col) => (
                      <td key={col.key} style={{ color: col.tone?.(p) }}>
                        {col.display(p, ctx)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
