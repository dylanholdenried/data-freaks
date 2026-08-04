"use client";

import { OVER_MARKET_POM, STALE_14_DAYS, STALE_DAYS } from "@/lib/inventory-command/config";
import { overMarketUnits, retailNoPrice, retailStale } from "@/lib/inventory-command/midmo";
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
import { IcKpi, IcPanel } from "../ui/primitives";
import { IcTable, type IcCol } from "../ui/IcTable";

export default function PricingTab({ units }: { units: InvUnitRow[] }) {
  const stale7 = retailStale(units, STALE_DAYS).sort((a, b) => (b.dsr ?? 0) - (a.dsr ?? 0));
  const stale14 = retailStale(units, STALE_14_DAYS);
  const noPrice = retailNoPrice(units).sort((a, b) => (b.age ?? 0) - (a.age ?? 0));
  const overMkt = overMarketUnits(units);

  const queueCols: IcCol<InvUnitRow>[] = [
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

  const noPriceCols: IcCol<InvUnitRow>[] = [
    colStock(),
    colVeh(),
    colAge(),
    colCost(),
    colPhotos(),
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2.5">
        <IcKpi
          label={`Stale ${STALE_DAYS}+ days`}
          value={stale7.length}
          status={stale7.length ? "bad" : "ok"}
        />
        <IcKpi
          label={`Stale ${STALE_14_DAYS}+ days`}
          value={stale14.length}
          status={stale14.length ? "bad" : "ok"}
        />
        <IcKpi
          label="No price set"
          value={noPrice.length}
          sub="invisible online until priced"
          status={noPrice.length ? "warn" : "ok"}
        />
        <IcKpi
          label={`Over ${OVER_MARKET_POM}% of market`}
          value={overMkt.length}
          sub="priced not to sell"
          status={overMkt.length ? "bad" : "ok"}
        />
      </div>

      <IcPanel
        title={`Repricing queue – ${STALE_DAYS}+ days since last price change`}
        note="stale + aged + over market = first in line"
      >
        <IcTable cols={queueCols} rows={stale7} defaultSort="dsr" defaultDir="desc" maxH={420} />
      </IcPanel>

      <IcPanel title="No price set" note="every day unpriced is a day of zero SRPs">
        <IcTable cols={noPriceCols} rows={noPrice} defaultSort="age" defaultDir="desc" maxH={300} />
      </IcPanel>
    </div>
  );
}
