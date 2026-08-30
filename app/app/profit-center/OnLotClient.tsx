"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { profitCenterHref } from "@/lib/profit-center/cohort";
import { pcFmt$, pcFmtN } from "@/lib/profit-center/format";
import {
  rateInventoryUnits,
  type RatedInventoryUnit,
  type SalesProfile,
  type UnitRating,
} from "@/lib/profit-center/inventoryBridge";
import type { DateRange } from "@/lib/profit-center/dateRange";
import type { InvUnitRow } from "@/lib/inventory-command/types";
import { cn } from "@/lib/utils";

type Store = { id: string; name: string };

type SortKey = "stk" | "age" | "cost" | "price" | "ph" | "rating";

interface Props {
  make: string;
  model: string;
  stores: Store[];
  units: InvUnitRow[];
  profile: SalesProfile;
  snapshotDate: string | null;
  preset: string;
  storeId: string;
  departmentName: string;
  range: DateRange;
  cohortBackHref: string;
}

function ratingLabel(r: UnitRating) {
  if (r === "good") return "Good";
  if (r === "bad") return "Bad";
  return "Neutral";
}

function ratingClass(r: UnitRating) {
  if (r === "good") return "buy";
  if (r === "bad") return "red";
  return "near";
}

function sortRated(
  rows: RatedInventoryUnit[],
  key: SortKey,
  dir: "asc" | "desc"
): RatedInventoryUnit[] {
  const order = { good: 2, neutral: 1, bad: 0 };
  const copy = [...rows];
  copy.sort((a, b) => {
    let av: string | number = 0;
    let bv: string | number = 0;
    const ua = a.unit;
    const ub = b.unit;
    switch (key) {
      case "stk":
        av = ua.stk;
        bv = ub.stk;
        break;
      case "age":
        av = ua.age ?? -Infinity;
        bv = ub.age ?? -Infinity;
        break;
      case "cost":
        av = ua.cost ?? -Infinity;
        bv = ub.cost ?? -Infinity;
        break;
      case "price":
        av = ua.price ?? -Infinity;
        bv = ub.price ?? -Infinity;
        break;
      case "ph":
        av = ua.ph ?? -Infinity;
        bv = ub.ph ?? -Infinity;
        break;
      case "rating":
        av = order[a.rating];
        bv = order[b.rating];
        break;
    }
    if (typeof av === "string" && typeof bv === "string") {
      return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    const an = typeof av === "number" ? av : -Infinity;
    const bn = typeof bv === "number" ? bv : -Infinity;
    return dir === "asc" ? an - bn : bn - an;
  });
  return copy;
}

export default function OnLotClient({
  make,
  model,
  stores,
  units,
  profile,
  snapshotDate,
  preset,
  storeId,
  departmentName,
  range,
  cohortBackHref,
}: Props) {
  const [filter, setFilter] = useState<"all" | UnitRating>("all");
  const [sortKey, setSortKey] = useState<SortKey>("rating");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const rated = useMemo(
    () => rateInventoryUnits(units, profile),
    [units, profile]
  );

  const filtered = useMemo(() => {
    const base =
      filter === "all" ? rated : rated.filter((r) => r.rating === filter);
    return sortRated(base, sortKey, sortDir);
  }, [rated, filter, sortKey, sortDir]);

  const counts = useMemo(
    () => ({
      good: rated.filter((r) => r.rating === "good").length,
      bad: rated.filter((r) => r.rating === "bad").length,
      neutral: rated.filter((r) => r.rating === "neutral").length,
    }),
    [rated]
  );

  const storeLabel =
    storeId === "all"
      ? "All stores"
      : stores.find((s) => s.id === storeId)?.name ?? "Store";

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "stk" ? "asc" : "desc");
    }
  }

  return (
    <div className={cn("pc-command space-y-4")}>
      <header className="pc-head">
        <div>
          <p className="pc-kicker">
            <Link href={cohortBackHref} className="pc-link">
              ← {make} {model}
            </Link>
            {" · "}
            <Link href={profitCenterHref({ preset, storeId, departmentName })} className="pc-link">
              Profit Center
            </Link>
          </p>
          <h1 className="pc-title">
            On lot: {make} {model}
          </h1>
          <p className="pc-meta">
            {storeLabel}
            {snapshotDate ? ` · snapshot ${snapshotDate}` : ""}
            {" · "}
            {units.length} unit{units.length === 1 ? "" : "s"}
          </p>
          <p className="pc-muted">
            Good / bad uses lot health (age, photos, price) and how this model&apos;s
            sale history performs by year and price band.
          </p>
        </div>
      </header>

      <div className="pc-kpi-grid pc-kpi-grid-compact">
        <div className="pc-kpi">
          <div className="pc-kpi-label">Good</div>
          <div className="pc-kpi-value green">{counts.good}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Neutral</div>
          <div className="pc-kpi-value">{counts.neutral}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Bad</div>
          <div className="pc-kpi-value red">{counts.bad}</div>
        </div>
      </div>

      <div className="pc-pill-row">
        {(["all", "good", "neutral", "bad"] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={cn("pc-pill", filter === f && "is-active")}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "All" : ratingLabel(f)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="pc-empty">No units match this filter.</p>
      ) : (
        <div className="pc-table-wrap">
          <table className="pc-table">
            <thead>
              <tr>
                <th>
                  <button type="button" className="pc-sort" onClick={() => toggleSort("rating")}>
                    Rating{sortKey === "rating" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </th>
                <th>
                  <button type="button" className="pc-sort" onClick={() => toggleSort("stk")}>
                    Stock{sortKey === "stk" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </th>
                <th>Vehicle</th>
                <th className="text-right">
                  <button type="button" className="pc-sort" onClick={() => toggleSort("age")}>
                    Age{sortKey === "age" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </th>
                <th className="text-right">
                  <button type="button" className="pc-sort" onClick={() => toggleSort("cost")}>
                    Cost{sortKey === "cost" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </th>
                <th className="text-right">
                  <button type="button" className="pc-sort" onClick={() => toggleSort("price")}>
                    Price{sortKey === "price" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </th>
                <th className="text-right">
                  <button type="button" className="pc-sort" onClick={() => toggleSort("ph")}>
                    Photos{sortKey === "ph" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ unit, rating, reasons }) => (
                <tr key={unit.stk}>
                  <td>
                    <span className={cn("pc-buybox-score", ratingClass(rating))}>
                      {ratingLabel(rating)}
                    </span>
                  </td>
                  <td>{unit.stk}</td>
                  <td>{unit.veh ?? "—"}</td>
                  <td className="text-right">
                    {unit.age == null ? "—" : `${pcFmtN(unit.age, 0)}d`}
                  </td>
                  <td className="text-right">{pcFmt$(unit.cost)}</td>
                  <td className="text-right">{pcFmt$(unit.price)}</td>
                  <td className="text-right">{unit.ph ?? "—"}</td>
                  <td className="pc-muted text-sm">{reasons.join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}