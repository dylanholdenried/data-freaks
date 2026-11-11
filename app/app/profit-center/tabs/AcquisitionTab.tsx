"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { RollupRow } from "@/lib/profit-center/aggregate";
import { cohortHref } from "@/lib/profit-center/cohort";
import type { DatePreset } from "@/lib/profit-center/dateRange";
import { fmt$, fmtN, fmtPct } from "../format";

type CohortCtx = {
  preset: DatePreset;
  storeId: string;
  departmentName: string;
};

type AcqSort =
  | "label"
  | "volume"
  | "avgTotal"
  | "avgFront"
  | "avgBack"
  | "avgAge"
  | "tradePct";

export default function AcquisitionTab({
  rows,
  cohortCtx,
}: {
  rows: RollupRow[];
  cohortCtx: CohortCtx;
}) {
  const [sortKey, setSortKey] = useState<AcqSort>("avgTotal");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const visible = useMemo(
    () => rows.filter((r) => !r.isTotal && r.volume > 0),
    [rows]
  );

  const sorted = useMemo(() => {
    const copy = [...visible];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (sortKey === "label") {
        return sortDir === "asc"
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      }
      const an = typeof av === "number" && Number.isFinite(av) ? av : -Infinity;
      const bn = typeof bv === "number" && Number.isFinite(bv) ? bv : -Infinity;
      return sortDir === "asc" ? an - bn : bn - an;
    });
    return copy;
  }, [visible, sortKey, sortDir]);

  function toggle(k: AcqSort) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "label" ? "asc" : "desc");
    }
  }

  function mark(k: AcqSort) {
    return sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : "";
  }

  return (
    <section className="pc-stocking">
      <div className="pc-buybox-head">
        <h2>Acquisition performance</h2>
        <p>
          How each source is performing in this cut — sorted by avg total gross
          by default.
        </p>
      </div>
      {sorted.length === 0 ? (
        <p className="pc-muted">No acquisition data in this cut.</p>
      ) : (
        <div className="pc-table-wrap">
          <table className="pc-table">
            <thead>
              <tr>
                <th>
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggle("label")}
                  >
                    Source{mark("label")}
                  </button>
                </th>
                <th className="text-right">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggle("volume")}
                  >
                    Vol{mark("volume")}
                  </button>
                </th>
                <th className="text-right">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggle("avgFront")}
                  >
                    Front{mark("avgFront")}
                  </button>
                </th>
                <th className="text-right">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggle("avgBack")}
                  >
                    Back{mark("avgBack")}
                  </button>
                </th>
                <th className="text-right">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggle("avgTotal")}
                  >
                    Total{mark("avgTotal")}
                  </button>
                </th>
                <th className="text-right">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggle("avgAge")}
                  >
                    Turn{mark("avgAge")}
                  </button>
                </th>
                <th className="text-right">
                  <button
                    type="button"
                    className="pc-sort"
                    onClick={() => toggle("tradePct")}
                  >
                    Trade %{mark("tradePct")}
                  </button>
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  <td className="text-right">{row.volume}</td>
                  <td className="text-right">{fmt$(row.avgFront)}</td>
                  <td className="text-right">{fmt$(row.avgBack)}</td>
                  <td className="text-right">{fmt$(row.avgTotal)}</td>
                  <td className="text-right">
                    {row.avgAge == null ? "—" : `${fmtN(row.avgAge, 0)}d`}
                  </td>
                  <td className="text-right">{fmtPct(row.tradePct)}</td>
                  <td className="text-right">
                    <Link
                      href={cohortHref({
                        focus: "acquisition",
                        value: row.label,
                        ...cohortCtx,
                      })}
                      className="pc-link"
                    >
                      View deals
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
