"use client";

import { FULL_PHOTO_COUNT, INV_TARGETS } from "@/lib/inventory-command/config";
import { fmtNum } from "@/lib/inventory-command/format";
import { IC, ttlFailUnits } from "@/lib/inventory-command/midmo";
import type { InvUnitRow } from "@/lib/inventory-command/types";
import {
  colAge,
  colPhotos,
  colPrice,
  colSrp,
  colStock,
  colVdp,
  colVeh,
} from "../ui/columns";
import { IcKpi, IcPanel } from "../ui/primitives";
import { IcTable, type IcCol } from "../ui/IcTable";

export default function MerchandisingTab({ units }: { units: InvUnitRow[] }) {
  const full = units.filter((u) => (u.ph ?? 0) >= FULL_PHOTO_COUNT);
  const temp = units.filter((u) => (u.ph ?? 0) > 0 && (u.ph ?? 0) < FULL_PHOTO_COUNT);
  const noPh = units.filter((u) => (u.ph ?? 0) === 0);
  const ttl = ttlFailUnits(units).sort((a, b) => (b.srp ?? 0) - (a.srp ?? 0));
  const pctFull = units.length ? Math.round((full.length / units.length) * 100) : 0;

  const cols: IcCol<InvUnitRow>[] = [
    colStock(),
    colVeh(),
    colAge(),
    colPhotos(),
    colSrp(),
    colVdp(),
    {
      key: "spd",
      label: "SRP / Day",
      right: true,
      sortValue: (u) => (u.srp ?? 0) / Math.max(u.age ?? 1, 1),
      render: (u) => fmtNum((u.srp ?? 0) / Math.max(u.age ?? 1, 1), 1),
    },
    colPrice(),
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2.5">
        <IcKpi
          label={`Full photos (${FULL_PHOTO_COUNT}+)`}
          value={full.length}
          sub={`${pctFull}% of lot`}
          status="ok"
        />
        <IcKpi label={`Temp photos (1-${FULL_PHOTO_COUNT - 1})`} value={temp.length} status="warn" />
        <IcKpi label="No photos" value={noPh.length} status={noPh.length ? "bad" : "ok"} />
        <IcKpi
          label={`TTL fails (past day ${INV_TARGETS.ttlDays})`}
          value={ttl.length}
          sub="the accountability number"
          status={ttl.length ? "bad" : "ok"}
        />
      </div>

      <IcPanel
        title={`TTL violations — past day ${INV_TARGETS.ttlDays} without full photos`}
        note="sorted by demand burned (SRP) — shoot the top of this list first"
      >
        <IcTable cols={cols} rows={ttl} defaultSort="srp" defaultDir="desc" maxH={520} />
        <p className="mt-2 text-[11px]" style={{ color: IC.muted }}>
          {ttl.length} units · fix photos before price work on these.
        </p>
      </IcPanel>
    </div>
  );
}
