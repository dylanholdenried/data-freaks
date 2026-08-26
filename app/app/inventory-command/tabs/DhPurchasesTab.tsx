"use client";

import { FULL_PHOTO_COUNT, INV_TARGETS } from "@/lib/inventory-command/config";
import {
  collectDhUnitsForStore,
  dhHighLookersNotSelling,
  dhLowVisibility,
  dhMerchGaps,
  dhPrefixForStore,
  dhSummary,
  type DhUnitRow,
} from "@/lib/inventory-command/dh-purchases";
import { fmtMoney, fmtMoneyCompact, fmtNum } from "@/lib/inventory-command/format";
import { IC } from "@/lib/inventory-command/midmo";
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
import { IcAttention, IcEmpty, IcKpi, IcPanel } from "../ui/primitives";
import { IcTable, type IcCol } from "../ui/IcTable";

function spreadTone(n: number | null | undefined): string {
  if (n == null) return IC.muted;
  return n < 0 ? IC.red : IC.green;
}

function baseDhCols(): IcCol<DhUnitRow>[] {
  return [
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
    {
      key: "spd",
      label: "SRP / Day",
      right: true,
      render: (u) => (u.spd == null ? "—" : fmtNum(u.spd, 1)),
      sortValue: (u) => u.spd,
    },
    {
      key: "mmr",
      label: "MMR",
      right: true,
      render: (u) => fmtMoney(u.mmr),
    },
    {
      key: "mmrSpread",
      label: "MMR − Cost",
      right: true,
      color: (u) => spreadTone(u.mmrSpread),
      render: (u) => fmtMoney(u.mmrSpread),
      sortValue: (u) => u.mmrSpread,
    },
    {
      key: "jd",
      label: "JD Trade",
      right: true,
      render: (u) => fmtMoney(u.jd),
    },
    {
      key: "jdSpread",
      label: "JD − Cost",
      right: true,
      color: (u) => spreadTone(u.jdSpread),
      render: (u) => fmtMoney(u.jdSpread),
      sortValue: (u) => u.jdSpread,
    },
    {
      key: "act",
      label: "Called Action",
      sortable: false,
      render: (u) => (
        <span style={{ color: u.action.color, fontWeight: 600 }}>{u.action.label}</span>
      ),
    },
  ];
}

export default function DhPurchasesTab({
  units,
  storeId,
  storeName,
}: {
  units: InvUnitRow[];
  storeId: string;
  storeName: string;
}) {
  const prefix = dhPrefixForStore(storeName);
  const rows = collectDhUnitsForStore(units, storeId, storeName);
  const summary = dhSummary(rows);
  const merchGaps = dhMerchGaps(rows);
  const lookers = dhHighLookersNotSelling(rows);
  const lowVis = dhLowVisibility(rows);
  const cols = baseDhCols();

  if (!prefix) {
    return (
      <IcEmpty>
        DH Purchases is set up for Linn (DHL) and Centralia (DHC). Switch to one of those
        stores to track your cars.
      </IcEmpty>
    );
  }

  if (rows.length === 0) {
    return (
      <IcEmpty>
        No {prefix} purchases in this store&apos;s latest snapshot. DH cars here are stock
        numbers that start with &quot;{prefix}&quot;.
      </IcEmpty>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2.5">
        <IcKpi
          label={`${prefix} in stock`}
          value={summary.count}
          sub={`${fmtMoneyCompact(summary.costTied)} at cost`}
          status="ok"
        />
        <IcKpi
          label="Needs price"
          value={summary.noPrice}
          sub={`unpriced ${prefix} units`}
          status={summary.noPrice ? "warn" : "ok"}
        />
        <IcKpi
          label="Needs photos"
          value={summary.photoGaps}
          sub={`under ${FULL_PHOTO_COUNT} photos`}
          status={summary.photoGaps ? "warn" : "ok"}
        />
        <IcKpi
          label="Avg age"
          value={summary.avgAge != null ? `${fmtNum(summary.avgAge, 0)}d` : "—"}
          sub={`target ≤ ${INV_TARGETS.turnDays}d`}
          status={
            summary.avgAge == null
              ? "neutral"
              : summary.avgAge > INV_TARGETS.turnDays
                ? "bad"
                : "ok"
          }
        />
        <IcKpi
          label="Avg MMR − Cost"
          value={fmtMoneyCompact(summary.avgMmrSpread)}
          sub="wholesale water"
          status={
            summary.avgMmrSpread == null
              ? "neutral"
              : summary.avgMmrSpread < 0
                ? "bad"
                : "ok"
          }
        />
        <IcKpi
          label="Avg JD − Cost"
          value={fmtMoneyCompact(summary.avgJdSpread)}
          sub="JD trade vs cost"
          status={
            summary.avgJdSpread == null
              ? "neutral"
              : summary.avgJdSpread < 0
                ? "bad"
                : "ok"
          }
        />
      </div>

      <IcPanel
        title="What needs attention"
        note={`${prefix} purchases at this store only`}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 10,
          }}
        >
          <IcAttention
            color={IC.red}
            title={`${summary.noPrice} unpriced · ${summary.photoGaps} photo gaps`}
            body="Cars without a live price or full photo set will not sell online. Fix these first — you only get paid when they retail."
          />
          <IcAttention
            color={IC.orange}
            title={`${lookers.length} getting looks but not selling`}
            body="High SRP/VDP with weak conversion. Shoppers found them and bounced — usually price vs market, photos, or description."
          />
          <IcAttention
            color={IC.yellow}
            title={`${lowVis.length} low online visibility`}
            body={`Aged ${prefix} cars with weak SRP/day. Nobody is finding them — check photos, price vs market, and whether the model has demand.`}
          />
          <IcAttention
            color={IC.blue}
            title={`${fmtMoneyCompact(summary.costTied)} capital tied up`}
            body={`Avg age ${summary.avgAge != null ? `${fmtNum(summary.avgAge, 0)}d` : "—"}. Every extra day burns profit and delays your payout.`}
          />
        </div>
      </IcPanel>

      <IcPanel
        title={`All ${prefix} inventory`}
        note="this store · sorted by age · MMR water + JD − cost"
      >
        <IcTable cols={cols} rows={rows} defaultSort="age" defaultDir="desc" maxH={480} />
      </IcPanel>

      <IcPanel
        title="Not priced and/or not pictured"
        note="merchandising blockers — fix before worrying about demand"
      >
        {merchGaps.length === 0 ? (
          <p className="text-sm" style={{ color: IC.muted }}>
            All {prefix} cars have a price and full photo sets.
          </p>
        ) : (
          <IcTable
            cols={cols}
            rows={merchGaps}
            defaultSort="age"
            defaultDir="desc"
            maxH={360}
          />
        )}
      </IcPanel>

      <IcPanel
        title="Getting looks but not selling"
        note="high SRP/VDP, weak conversion — price or photos are losing the click"
      >
        {lookers.length === 0 ? (
          <p className="text-sm" style={{ color: IC.muted }}>
            No aged {prefix} cars flagged for high looks / low conversion.
          </p>
        ) : (
          <IcTable
            cols={cols}
            rows={lookers}
            defaultSort="srp"
            defaultDir="desc"
            maxH={360}
          />
        )}
      </IcPanel>

      <IcPanel
        title="Not getting looks"
        note={`low SRP/day among aged ${prefix} — why isn’t anyone searching these?`}
      >
        {lowVis.length === 0 ? (
          <p className="text-sm" style={{ color: IC.muted }}>
            No low-visibility {prefix} cars in the aged set.
          </p>
        ) : (
          <IcTable
            cols={cols}
            rows={lowVis}
            defaultSort="spd"
            defaultDir="asc"
            maxH={360}
          />
        )}
      </IcPanel>

      <p className="mt-2 text-xs" style={{ color: IC.muted }}>
        Linn = DHL · Centralia = DHC · SRP/VDP = AutoTrader + Cars.com · JD Trade = vAuto JD
        Power trade-in · MMR − Cost = wholesale water
      </p>
    </div>
  );
}
