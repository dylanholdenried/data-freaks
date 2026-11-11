import type { RollupRow } from "@/lib/profit-center/aggregate";
import type { BuyBoxResult, ScoredModel } from "@/lib/profit-center/buyBox";
import { cohortHref } from "@/lib/profit-center/cohort";
import type { DatePreset } from "@/lib/profit-center/dateRange";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { fmt$, fmtN, fmtPct } from "../format";

type CohortCtx = {
  preset: DatePreset;
  storeId: string;
  departmentName: string;
};

function StockingRow({
  row,
  kind,
  href,
}: {
  row: ScoredModel;
  kind: "buy" | "red";
  href: string;
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
        <Link href={href} className="pc-link">
          View deals
        </Link>
      </div>
      <div className={cn("pc-buybox-score", kind === "red" ? "red" : "buy")}>
        {(row.score * 100).toFixed(0)}
      </div>
    </div>
  );
}

function StockingCol({
  title,
  box,
  hrefFor,
}: {
  title: string;
  box: BuyBoxResult;
  hrefFor: (row: RollupRow) => string;
}) {
  return (
    <div className="pc-stocking-col">
      <h3>{title}</h3>
      <div className="pc-buybox-title buy">Lean in</div>
      {box.buys.length === 0 ? (
        <p className="pc-muted">No signals yet.</p>
      ) : (
        box.buys.slice(0, 3).map((row) => (
          <StockingRow
            key={row.key}
            row={row}
            kind="buy"
            href={hrefFor(row)}
          />
        ))
      )}
      <div className="pc-buybox-title red">Caution</div>
      {box.reds.length === 0 ? (
        <p className="pc-muted">No cautions.</p>
      ) : (
        box.reds.slice(0, 3).map((row) => (
          <StockingRow
            key={row.key}
            row={row}
            kind="red"
            href={hrefFor(row)}
          />
        ))
      )}
    </div>
  );
}

export default function StockingTab({
  priceBox,
  odometerBox,
  yearBox,
  cohortCtx,
}: {
  priceBox: BuyBoxResult;
  odometerBox: BuyBoxResult;
  yearBox: BuyBoxResult;
  cohortCtx: CohortCtx;
}) {
  return (
    <section className="pc-stocking">
      <div className="pc-buybox-head">
        <h2>Stocking signals</h2>
        <p>
          Automated recommendations by sale price, odometer, and year — stock
          what makes the bottom line, not just what sells fast.
        </p>
      </div>
      <div className="pc-stocking-grid">
        <StockingCol
          title="Sale price"
          box={priceBox}
          hrefFor={(row) =>
            cohortHref({
              focus: "price",
              value: row.key,
              ...cohortCtx,
            })
          }
        />
        <StockingCol
          title="Odometer"
          box={odometerBox}
          hrefFor={(row) =>
            cohortHref({
              focus: "odometer",
              value: row.key,
              ...cohortCtx,
            })
          }
        />
        <StockingCol
          title="Year"
          box={yearBox}
          hrefFor={(row) =>
            cohortHref({
              focus: "year",
              value: row.label,
              ...cohortCtx,
            })
          }
        />
      </div>
    </section>
  );
}
