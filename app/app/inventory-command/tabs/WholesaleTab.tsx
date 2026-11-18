"use client";

import { useMemo } from "react";
import { fmtMoney, fmtMoneyCompact, fmtNum } from "@/lib/inventory-command/format";
import { IC, mmrWater } from "@/lib/inventory-command/midmo";
import { wholesaleUnits } from "@/lib/inventory-command/compute";
import type { InvUnitDetailRow } from "@/lib/inventory-command/types";
import {
  colAge,
  colCost,
  colPhotos,
  colPrice,
  colStock,
  colVeh,
} from "../ui/columns";
import { IcEmpty, IcKpi, IcPanel } from "../ui/primitives";
import { IcTable, type IcCol } from "../ui/IcTable";

export default function WholesaleTab({ units }: { units: InvUnitDetailRow[] }) {
  const wholesale = useMemo(
    () =>
      wholesaleUnits(units).sort((a, b) => (b.age ?? 0) - (a.age ?? 0)),
    [units]
  );

  const totals = useMemo(() => {
    const cost = wholesale.reduce((s, u) => s + (u.cost || 0), 0);
    const over60 = wholesale.filter((u) => (u.age ?? 0) >= 60).length;
    const avgAge =
      wholesale.length > 0
        ? Math.round(
            (wholesale.reduce((s, u) => s + (u.age ?? 0), 0) / wholesale.length) * 10
          ) / 10
        : null;
    return { cost, over60, avgAge };
  }, [wholesale]);

  const cols: IcCol<InvUnitDetailRow>[] = [
    colStock(),
    colVeh(),
    {
      key: "vin",
      label: "VIN",
      render: (u) => u.vin ?? "—",
      sortValue: (u) => u.vin,
    },
    colAge(),
    colCost(),
    colPrice(),
    {
      key: "mmr",
      label: "MMR",
      right: true,
      render: (u) => fmtMoney(u.mmr),
      sortValue: (u) => u.mmr,
    },
    {
      key: "mmr_water",
      label: "MMR Water",
      right: true,
      color: (u) => {
        const w = mmrWater(u);
        if (w == null) return IC.muted;
        return w < 0 ? IC.red : IC.green;
      },
      render: (u) => {
        const w = mmrWater(u);
        return w == null ? "—" : fmtMoney(w);
      },
      sortValue: (u) => mmrWater(u),
    },
    {
      key: "bb_avg_wholesale",
      label: "BB Avg WS",
      right: true,
      render: (u) => fmtMoney(u.bb_avg_wholesale),
      sortValue: (u) => u.bb_avg_wholesale,
    },
    colPhotos(),
  ];

  if (wholesale.length === 0) {
    return (
      <IcEmpty>
        No wholesale units in this snapshot. Mark disposition as &quot;wholesale&quot; in the
        daily upload to land cars here — they stay out of prime and subprime tabs.
      </IcEmpty>
    );
  }

  return (
    <div>
      <div
        className="mb-4 grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}
      >
        <IcKpi label="Wholesale units" value={fmtNum(wholesale.length)} />
        <IcKpi label="Cost" value={fmtMoneyCompact(totals.cost)} />
        <IcKpi
          label="Avg age"
          value={totals.avgAge != null ? `${fmtNum(totals.avgAge, 0)}d` : "—"}
        />
        <IcKpi
          label="60+ days"
          value={fmtNum(totals.over60)}
          status={totals.over60 ? "warn" : "ok"}
        />
      </div>

      <IcPanel
        title="Wholesale inventory"
        note={`${wholesale.length} units · ${fmtMoneyCompact(totals.cost)} at cost · disposition = wholesale · excluded from prime / subprime command tabs`}
      >
        <IcTable
          cols={cols}
          rows={wholesale}
          defaultSort="age"
          defaultDir="desc"
          maxH={560}
          rowKey={(u) => u.stk}
        />
      </IcPanel>
    </div>
  );
}
