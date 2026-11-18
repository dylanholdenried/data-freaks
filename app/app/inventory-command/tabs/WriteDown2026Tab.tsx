"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtMoney, fmtMoneyCompact, fmtNum } from "@/lib/inventory-command/format";
import { IC } from "@/lib/inventory-command/midmo";
import type { InvUnitDetailRow, WriteDownBbManual } from "@/lib/inventory-command/types";
import type { WriteDownCohortRow } from "@/lib/inventory-command/types";
import {
  buildActiveWriteDownRows,
  buildSoldWriteDownRows,
  daysUntilWriteDownTarget,
  WRITE_DOWN_YEAR,
  writeDownDispLabel,
  writeDownTotals,
  writeDownTotalsByDisp,
  type WriteDownDisplayRow,
} from "@/lib/inventory-command/write-down";
import { setWriteDownBbManualAction } from "../actions";
import { IcEmpty, IcKpi, IcPanel } from "../ui/primitives";
import { IcTable, type IcCol } from "../ui/IcTable";

function formatEnteredOn(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${m}/${d}/${y.slice(2)}`;
}

function ManualBbCell({
  row,
  storeId,
  canEdit,
}: {
  row: WriteDownDisplayRow;
  storeId: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(
    row.bb_avg_wholesale != null ? String(Math.round(row.bb_avg_wholesale)) : ""
  );
  const [error, setError] = useState<string | null>(null);

  if (!row.missing_bb && !row.manual) {
    return <>{fmtMoney(row.bb_avg_wholesale)}</>;
  }

  if (!canEdit) {
    return (
      <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
        <span>{row.bb_avg_wholesale != null ? fmtMoney(row.bb_avg_wholesale) : "—"}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: IC.yellow }}>
          {row.manual
            ? `Manual ${formatEnteredOn(row.manual_entered_on)}`
            : "Missing BB"}
        </span>
      </span>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(row.bb_avg_wholesale != null ? String(Math.round(row.bb_avg_wholesale)) : "");
          setError(null);
          setEditing(true);
        }}
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          cursor: "pointer",
          textAlign: "right",
          color: "inherit",
          font: "inherit",
        }}
        title="Enter Black Book Average Wholesale"
      >
        <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
          <span style={{ textDecoration: "underline", textDecorationStyle: "dotted" }}>
            {row.bb_avg_wholesale != null ? fmtMoney(row.bb_avg_wholesale) : "Enter BB"}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, color: IC.yellow }}>
            {row.manual
              ? `Manual ${formatEnteredOn(row.manual_entered_on)}`
              : "Missing BB"}
          </span>
        </span>
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const n = Number(String(value).replace(/[$,\s]/g, ""));
        if (!Number.isFinite(n) || n < 0) {
          setError("Invalid amount");
          return;
        }
        startTransition(async () => {
          const res = await setWriteDownBbManualAction({
            storeId,
            stk: row.stk,
            bbAvgWholesale: n,
          });
          if (!res.ok) {
            setError(res.error);
            return;
          }
          setEditing(false);
          router.refresh();
        });
      }}
      style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}
    >
      <input
        autoFocus
        value={value}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
        }}
        style={{
          width: 96,
          borderRadius: 4,
          border: `1px solid ${IC.border}`,
          background: IC.bg,
          color: IC.text,
          padding: "3px 6px",
          fontSize: 12,
          textAlign: "right",
        }}
      />
      <span style={{ display: "flex", gap: 6 }}>
        <button
          type="submit"
          disabled={pending}
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: IC.yellow,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          {pending ? "…" : "Save"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setEditing(false)}
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: IC.muted,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          Cancel
        </button>
      </span>
      {error ? (
        <span style={{ fontSize: 10, color: IC.red }}>{error}</span>
      ) : (
        <span style={{ fontSize: 10, fontWeight: 700, color: IC.yellow }}>
          {row.manual ? `Manual ${formatEnteredOn(row.manual_entered_on)}` : "Missing BB"}
        </span>
      )}
    </form>
  );
}

function writeDownCols(
  storeId: string,
  canEdit: boolean,
  includeSoldDate: boolean
): IcCol<WriteDownDisplayRow>[] {
  const cols: IcCol<WriteDownDisplayRow>[] = [
    {
      key: "stk",
      label: "Stock #",
      bold: true,
      sortValue: (r) => r.stk,
    },
    {
      key: "vin",
      label: "VIN",
      render: (r) => r.vin ?? "—",
      sortValue: (r) => r.vin,
    },
    {
      key: "year",
      label: "Year",
      right: true,
      render: (r) => r.year ?? "—",
      sortValue: (r) => r.year,
    },
    {
      key: "make",
      label: "Make",
      render: (r) => r.make ?? "—",
      sortValue: (r) => r.make,
    },
    {
      key: "model",
      label: "Model",
      render: (r) => r.model ?? "—",
      sortValue: (r) => r.model,
    },
    {
      key: "disp",
      label: "Disposition",
      render: (r) =>
        /\bunits\b/i.test(r.stk) ? "—" : writeDownDispLabel(r.disp),
      sortValue: (r) => writeDownDispLabel(r.disp),
    },
    {
      key: "age",
      label: "Age",
      right: true,
      render: (r) => r.age ?? "—",
      sortValue: (r) => r.age,
    },
    {
      key: "age_on_1231",
      label: "Age 12/31/26",
      right: true,
      render: (r) => r.age_on_1231 ?? "—",
      sortValue: (r) => r.age_on_1231,
    },
    {
      key: "cost",
      label: "Cost",
      right: true,
      render: (r) => fmtMoney(r.cost),
      sortValue: (r) => r.cost,
    },
    {
      key: "bb_avg_wholesale",
      label: "BB Avg Wholesale",
      right: true,
      render: (r) => (
        <ManualBbCell row={r} storeId={storeId} canEdit={canEdit} />
      ),
      sortValue: (r) => r.bb_avg_wholesale,
    },
    {
      key: "write_down",
      label: "Write Down",
      right: true,
      bold: true,
      color: (r) => {
        if (r.write_down == null) return IC.muted;
        return r.write_down > 0 ? IC.red : IC.green;
      },
      render: (r) => (r.write_down == null ? "—" : fmtMoney(r.write_down)),
      sortValue: (r) => r.write_down,
    },
  ];

  if (includeSoldDate) {
    cols.push({
      key: "sold_date",
      label: "Left inventory",
      right: true,
      render: (r) => r.sold_date ?? "—",
      sortValue: (r) => r.sold_date,
    });
  }

  return cols;
}

export default function WriteDown2026Tab({
  storeId,
  units,
  snapshotDate,
  soldCohort,
  manuals,
  canEdit,
}: {
  storeId: string;
  units: InvUnitDetailRow[];
  snapshotDate: string | null;
  soldCohort: WriteDownCohortRow[];
  manuals: WriteDownBbManual[];
  canEdit: boolean;
}) {
  const active = useMemo(
    () =>
      snapshotDate
        ? buildActiveWriteDownRows(units, snapshotDate, manuals, WRITE_DOWN_YEAR)
        : [],
    [units, snapshotDate, manuals]
  );
  const sold = useMemo(
    () => buildSoldWriteDownRows(soldCohort, manuals),
    [soldCohort, manuals]
  );

  const activeTotals = useMemo(() => writeDownTotals(active), [active]);
  const soldTotals = useMemo(() => writeDownTotals(sold), [sold]);
  const activeByDisp = useMemo(() => writeDownTotalsByDisp(active), [active]);
  const soldByDisp = useMemo(() => writeDownTotalsByDisp(sold), [sold]);

  if (!snapshotDate) {
    return (
      <IcEmpty>
        No snapshot date — upload inventory to see the {WRITE_DOWN_YEAR} write-down list.
      </IcEmpty>
    );
  }

  const daysLeft = daysUntilWriteDownTarget(snapshotDate, WRITE_DOWN_YEAR);
  const activeCols = writeDownCols(storeId, canEdit, false);
  const soldCols = writeDownCols(storeId, canEdit, true);

  const activeFooter: WriteDownDisplayRow = {
    stk: "TOTALS",
    vin: null,
    year: null,
    make: null,
    model: null,
    age: null,
    age_on_1231: null,
    disp: "retail",
    cost: activeTotals.cost,
    bb_avg_wholesale: null,
    bb_uploaded: null,
    write_down: activeTotals.writeDown,
    missing_bb: false,
    manual: false,
    manual_entered_on: null,
    sold_date: null,
  };

  const soldFooter: WriteDownDisplayRow = {
    ...activeFooter,
    cost: soldTotals.cost,
    write_down: soldTotals.writeDown,
  };

  function dispTotalsNote(
    byDisp: ReturnType<typeof writeDownTotalsByDisp>
  ): string {
    return byDisp
      .map(
        (b) =>
          `${b.label}: ${b.units} · ${fmtMoneyCompact(b.cost)} cost · ${fmtMoneyCompact(b.writeDown)} WD`
      )
      .join("  ·  ");
  }

  return (
    <div>
      <div
        className="mb-4 grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}
      >
        <IcKpi label="In stock" value={fmtNum(activeTotals.units)} />
        <IcKpi label="In-stock cost" value={fmtMoneyCompact(activeTotals.cost)} />
        <IcKpi
          label="In-stock write-down"
          value={fmtMoneyCompact(activeTotals.writeDown)}
          status={activeTotals.writeDown > 0 ? "bad" : "ok"}
        />
        <IcKpi label="Sold off list" value={fmtNum(soldTotals.units)} />
      </div>

      <div
        className="mb-4 grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}
      >
        {activeByDisp.map((b) => (
          <IcKpi
            key={b.disp}
            label={`${b.label} (in stock)`}
            value={`${fmtNum(b.units)} · ${fmtMoneyCompact(b.writeDown)}`}
            sub={`${fmtMoneyCompact(b.cost)} at cost`}
            status={b.writeDown > 0 ? "warn" : "neutral"}
          />
        ))}
      </div>

      <IcPanel
        title={`${WRITE_DOWN_YEAR} write-down — will be 60+ on Dec 31`}
        note={
          daysLeft >= 0
            ? `${activeTotals.units} units still in stock · ${daysLeft} days to Dec 31 · write-down = max(0, cost − BB Avg Wholesale) · Missing BB flagged for manual entry · ${dispTotalsNote(activeByDisp)}`
            : `${activeTotals.units} units still in stock · past Dec 31 ${WRITE_DOWN_YEAR} · write-down = max(0, cost − BB Avg Wholesale) · ${dispTotalsNote(activeByDisp)}`
        }
      >
        {active.length === 0 ? (
          <IcEmpty>No units that will be 60+ days old on Dec 31, {WRITE_DOWN_YEAR}.</IcEmpty>
        ) : (
          <IcTable
            cols={activeCols}
            rows={active}
            defaultSort="write_down"
            defaultDir="desc"
            maxH={520}
            rowKey={(r) => r.stk}
            footer={{
              ...activeFooter,
              stk: `${activeTotals.units} units`,
              vin: null,
              make: null,
              model: null,
            }}
          />
        )}
      </IcPanel>

      <IcPanel
        title="Sold — left write-down list"
        note={`${soldTotals.units} units sold or otherwise gone from inventory · last known cost & BB · ${fmtMoneyCompact(soldTotals.writeDown)} write-down removed from exposure · ${dispTotalsNote(soldByDisp)}`}
      >
        {sold.length === 0 ? (
          <IcEmpty>No write-down units have left inventory yet.</IcEmpty>
        ) : (
          <IcTable
            cols={soldCols}
            rows={sold}
            defaultSort="sold_date"
            defaultDir="desc"
            maxH={420}
            rowKey={(r) => `${r.stk}-${r.sold_date ?? ""}`}
            footer={{
              ...soldFooter,
              stk: `${soldTotals.units} units`,
            }}
          />
        )}
      </IcPanel>
    </div>
  );
}
