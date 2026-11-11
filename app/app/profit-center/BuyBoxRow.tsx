import Link from "next/link";
import { cn } from "@/lib/utils";
import type { RollupRow } from "@/lib/profit-center/aggregate";
import type { ScoredModel } from "@/lib/profit-center/buyBox";
import { fmt$, fmtN, fmtPct } from "./format";

function isScored(row: RollupRow | ScoredModel): row is ScoredModel {
  return "score" in row && typeof (row as ScoredModel).score === "number";
}

export default function BuyBoxRow({
  row,
  kind,
  href,
  compareHref: compare,
}: {
  row: RollupRow | ScoredModel;
  kind: "buy" | "red" | "near";
  href: string;
  compareHref: string;
}) {
  return (
    <div className="pc-buybox-row">
      <div className="pc-buybox-row-main">
        <b>{row.label}</b>
        <span>
          {row.volume} deals · front {fmt$(row.avgFront)} · back{" "}
          {fmt$(row.avgBack)} · {fmtN(row.avgAge, 0)}d · trade{" "}
          {fmtPct(row.tradePct)}
        </span>
        <div className="pc-buybox-actions">
          <Link href={href} className="pc-link">
            View deals
          </Link>
          {kind !== "near" && (
            <Link href={compare} className="pc-link">
              Compare
            </Link>
          )}
        </div>
      </div>
      {isScored(row) && kind !== "near" ? (
        <div className={cn("pc-buybox-score", kind === "red" ? "red" : "buy")}>
          {(row.score * 100).toFixed(0)}
        </div>
      ) : kind === "near" ? (
        <div className="pc-buybox-score near">{row.volume}</div>
      ) : null}
    </div>
  );
}
