"use client";

import { fmtNum } from "@/lib/inventory-command/format";
import { hottestDemand, mostClicks, seenButSkipped } from "@/lib/inventory-command/midmo";
import type { InvUnitRow } from "@/lib/inventory-command/types";
import {
  colAge,
  colCost,
  colDsr,
  colPhotos,
  colPom,
  colPrice,
  colSrp,
  colStock,
  colVdp,
  colVeh,
  colVr,
} from "../ui/columns";
import { IcPanel } from "../ui/primitives";
import { IcTable, type IcCol } from "../ui/IcTable";

export default function DemandTab({ units }: { units: InvUnitRow[] }) {
  const skipped = seenButSkipped(units);
  const hottest = hottestDemand(units, 50);
  const clicks = mostClicks(units, 50);

  const skippedCols: IcCol<InvUnitRow>[] = [
    colStock(),
    colVeh(),
    colAge(),
    colCost(),
    colPrice(),
    colPom(),
    colDsr(),
    colPhotos(),
    colSrp(),
    colVdp(),
    colVr(),
  ];

  const hotCols: IcCol<InvUnitRow & { spd: number }>[] = [
    colStock(),
    colVeh(),
    colAge(),
    colPrice(),
    {
      key: "spd",
      label: "SRP / Day",
      right: true,
      render: (u) => fmtNum(u.spd, 1),
    },
    colSrp(),
    colVdp(),
    colVr(),
    colPhotos(),
  ];

  const clickCols: IcCol<InvUnitRow>[] = [
    colStock(),
    colVeh(),
    colAge(),
    colCost(),
    colPrice(),
    colPom(),
    colDsr(),
    colPhotos(),
    colSrp(),
    colVdp(),
    colVr(),
  ];

  return (
    <div>
      <IcPanel
        title="Seen but skipped — high SRP, under 1% VDP"
        note="the market found these and scrolled past. Price or photos."
      >
        <IcTable cols={skippedCols} rows={skipped} defaultSort="srp" defaultDir="desc" maxH={420} />
      </IcPanel>

      <IcPanel
        title="Hottest market demand — SRPs per day in stock"
        note="what shoppers are searching for · feed the buy-box"
      >
        <IcTable cols={hotCols} rows={hottest} defaultSort="spd" defaultDir="desc" maxH={420} />
      </IcPanel>

      <IcPanel
        title="Most clicks — total VDPs"
        note="proven shopper interest · aged units here have a price gap, not a demand gap"
      >
        <IcTable cols={clickCols} rows={clicks} defaultSort="vdp" defaultDir="desc" maxH={420} />
      </IcPanel>
    </div>
  );
}
