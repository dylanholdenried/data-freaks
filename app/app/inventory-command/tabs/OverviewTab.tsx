"use client";

import { INV_TARGETS } from "@/lib/inventory-command/config";
import { fmtMoneyCompact, fmtNum } from "@/lib/inventory-command/format";
import {
  buildToShort,
  hotUnits,
  IC,
  mmrWater,
  retailNoPrice,
  retailStale,
  seenButSkipped,
  ttlFailUnits,
} from "@/lib/inventory-command/midmo";
import type { InvUnitRow } from "@/lib/inventory-command/types";
import { AgeBuckets, AgeWall } from "../ui/AgeCharts";
import { IcAttention, IcKpi, IcPanel } from "../ui/primitives";

export default function OverviewTab({
  units,
  snapshotDate,
}: {
  units: InvUnitRow[];
  snapshotDate: string | null;
}) {
  const k = units.length;
  const retail = units.filter((u) => u.disp !== "subprime");
  const sub = units.filter((u) => u.disp === "subprime");
  const noPrice = retailNoPrice(units);
  const stale7 = retailStale(units, 7);
  const ages = units.map((u) => u.age).filter((a): a is number => a != null);
  const avgAge =
    ages.length > 0 ? Math.round((ages.reduce((s, a) => s + a, 0) / ages.length) * 10) / 10 : null;
  const over60 = units.filter((u) => (u.age ?? 0) > 60);
  const over90 = units.filter((u) => (u.age ?? 0) >= 90);
  const hot = snapshotDate ? hotUnits(units, snapshotDate) : [];
  const hotCost = hot.reduce((s, u) => s + (u.cost || 0), 0);
  const ttl = ttlFailUnits(units);
  const noPh = units.filter((u) => (u.ph ?? 0) === 0);
  const tempPh = units.filter((u) => (u.ph ?? 0) > 0 && (u.ph ?? 0) < 16);
  const skipped = seenButSkipped(units);
  const hotWater = hot.reduce((s, u) => {
    const w = mmrWater(u);
    return s + (w ?? 0);
  }, 0);

  const firstOfNextLabel = (() => {
    if (!snapshotDate) return "the 1st";
    const d = new Date(snapshotDate + "T00:00:00Z");
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return `${months[next.getUTCMonth()]} ${next.getUTCDate()}`;
  })();

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2.5">
        <IcKpi
          label="Units in stock"
          value={k}
          sub={buildToShort(k)}
          status={k >= INV_TARGETS.stock ? "ok" : "warn"}
        />
        <IcKpi
          label="Retail / Subprime"
          value={`${retail.length} / ${sub.length}`}
          sub="disposition split"
          status="ok"
        />
        <IcKpi
          label="No price (retail)"
          value={noPrice.length}
          sub="subprime excluded"
          status={noPrice.length ? "warn" : "ok"}
        />
        <IcKpi
          label="Stale 7d+ (retail)"
          value={stale7.length}
          sub="subprime excluded"
          status={stale7.length ? "warn" : "ok"}
        />
        <IcKpi
          label="Avg age"
          value={avgAge != null ? `${fmtNum(avgAge, 0)}d` : "—"}
          sub={`target ≤ ${INV_TARGETS.turnDays}d`}
          status={
            avgAge == null ? "neutral" : avgAge > INV_TARGETS.turnDays ? "bad" : "ok"
          }
        />
        <IcKpi
          label="Over 60 days"
          value={over60.length}
          sub={`target 0 · ${over90.length} already 90+`}
          status={over60.length ? "neutral" : "ok"}
        />
        <IcKpi
          label={`Hot list (90+ by the 1st)`}
          value={hot.length}
          sub={`${fmtMoneyCompact(hotCost)} cash tied up`}
          status={hot.length ? "bad" : "ok"}
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2.5">
        <IcKpi
          label="TTL fails"
          value={ttl.length}
          sub={`< 16 photos past day ${INV_TARGETS.ttlDays}`}
          status={ttl.length === 0 ? "ok" : "bad"}
        />
        <IcKpi
          label="Stale prices (7d+)"
          value={stale7.length}
          sub={`${noPrice.length} units with no price`}
          status={stale7.length === 0 ? "ok" : "warn"}
        />
      </div>

      <IcPanel title="The Age Wall" note="Where the cash sits vs. the clock.">
        <AgeWall units={units} />
      </IcPanel>

      <IcPanel title="Age buckets" note="units · cash at cost">
        <AgeBuckets units={units} />
      </IcPanel>

      <IcPanel title="What needs attention this week" note="auto-flagged from this export">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 10,
          }}
        >
          <IcAttention
            color={IC.red}
            title={`${hot.length} units cross the 90 wall ${firstOfNextLabel}`}
            body={`${fmtMoneyCompact(hotCost)} at cost. MMR says ${fmtMoneyCompact(hotWater)} water if all wholesaled today — every week of drift makes the exit worse. Assign owner + action on the Hot List tab.`}
          />
          <IcAttention
            color={IC.orange}
            title={`${ttl.length} units past day ${INV_TARGETS.ttlDays} without full photos`}
            body={`${noPh.length} with zero photos, ${tempPh.length} with temp sets. High-SRP units without photos are burning free demand.`}
          />
          <IcAttention
            color={IC.yellow}
            title={`${stale7.length} units not repriced in 7+ days`}
            body={`${retailStale(units, 14).length} of them are 14+ days stale. Overpriced + stale + aged = the units that die on the lot.`}
          />
          <IcAttention
            color={IC.yellow}
            title={`${skipped.length} units seen online but skipped`}
            body="300+ SRPs with under 1% VDP conversion. The thumbnail (price or photo) is losing. Fix on the Demand tab."
          />
        </div>
      </IcPanel>
    </div>
  );
}
