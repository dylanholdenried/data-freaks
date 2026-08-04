"use client";

import {
  daysUntilFirstOfNextMonth,
  hotAgeThreshold,
} from "@/lib/inventory-command/compute";
import { fmtMoney, fmtMoneyCompact } from "@/lib/inventory-command/format";
import { calledAction, hotUnits, IC, mmrWater } from "@/lib/inventory-command/midmo";
import type { InvUnitRow } from "@/lib/inventory-command/types";
import {
  colAge,
  colCost,
  colPom,
  colPrice,
  colStock,
  colVdp,
  colVeh,
  colVr,
} from "../ui/columns";
import { IcEmpty, IcPanel } from "../ui/primitives";
import { IcTable, type IcCol } from "../ui/IcTable";

export default function HotListTab({
  units,
  snapshotDate,
}: {
  units: InvUnitRow[];
  snapshotDate: string | null;
}) {
  if (!snapshotDate) {
    return <IcEmpty>No snapshot date — upload inventory to see the hot list.</IcEmpty>;
  }

  const threshold = hotAgeThreshold(snapshotDate);
  const daysToFirst = daysUntilFirstOfNextMonth(snapshotDate);
  const hot = hotUnits(units, snapshotDate).sort((a, b) => (b.age ?? 0) - (a.age ?? 0));
  const cash = hot.reduce((s, u) => s + (u.cost || 0), 0);

  const d = new Date(snapshotDate + "T00:00:00Z");
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const byShort = `${months[next.getUTCMonth()]!.toUpperCase()} ${next.getUTCDate()}`;

  const cols: IcCol<InvUnitRow>[] = [
    colStock(),
    colVeh(),
    colAge(),
    colCost(),
    colPrice(),
    colPom(),
    {
      key: "mmr_water",
      label: "MMR Water",
      right: true,
      sortable: false,
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
    colVdp(),
    colVr(),
    {
      key: "act",
      label: "Called Action",
      sortable: false,
      render: (u) => {
        const a = calledAction(u);
        return <span style={{ color: a.color, fontWeight: 600 }}>{a.label}</span>;
      },
    },
  ];

  return (
    <div>
      <IcPanel
        title={`Hot list — 90+ by ${byShort} (age ≥ ${threshold} today)`}
        note={`${hot.length} units · ${fmtMoneyCompact(cash)} at cost · owner + deadline set Monday, checked Friday · 2 consecutive lists = mandatory exit`}
      >
        {hot.length === 0 ? (
          <IcEmpty>No hot units for this snapshot.</IcEmpty>
        ) : (
          <IcTable cols={cols} rows={hot} defaultSort="age" defaultDir="desc" maxH={560} />
        )}
        <div className="mt-2 text-xs" style={{ color: IC.muted }}>
          Action logic: 120+ days → exit. Over 110% of market → reprice under 100%. Missing
          photos → merchandise before touching price. Real VDP traffic → price move (demand
          exists). Otherwise price move + spiff. Threshold auto-set from {daysToFirst} days to{" "}
          {byShort}.
        </div>
      </IcPanel>
    </div>
  );
}
