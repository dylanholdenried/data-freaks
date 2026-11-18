"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { AcqPurchase } from "@/lib/acquire/types";
import type { OverviewSnapshot } from "@/lib/acquire/performance-analytics";
import {
  acquireInventoryAsOfDate,
  acquirePurchasesToInvUnits,
} from "@/lib/acquire/inv-unit-bridge";
import type { BuyBoxResult } from "@/lib/profit-center/buyBox";
import { fmt$, fmtN, fmtPct } from "@/app/app/profit-center/format";
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
import { AgeBuckets, AgeWall } from "@/app/app/inventory-command/ui/AgeCharts";
import {
  IcAttention,
  IcKpi,
  IcPanel,
  icDisplay,
  icSans,
} from "@/app/app/inventory-command/ui/primitives";

export default function OverviewTab({
  overview,
  buyBox,
  minVolume,
  purchases,
  onOpenBuyBox,
  onOpenSources,
}: {
  overview: OverviewSnapshot;
  buyBox: BuyBoxResult;
  minVolume: number;
  /** Store-scoped purchases (sold + unsold) for on-lot IC overview. */
  purchases: AcqPurchase[];
  onOpenBuyBox: () => void;
  onOpenSources: () => void;
}) {
  const { all, retail, wholesale, exitMix, byMake, totalSold } = overview;
  const maxMakeVol = Math.max(1, ...byMake.map((r) => r.retailCount));
  const wholesalePct =
    totalSold > 0 ? (wholesale.soldCount / totalSold) * 100 : null;

  const units = useMemo(
    () => acquirePurchasesToInvUnits(purchases),
    [purchases]
  );
  const snapshotDate = useMemo(() => acquireInventoryAsOfDate(), []);

  const k = units.length;
  const retailUnits = units.filter((u) => u.disp !== "subprime");
  const sub = units.filter((u) => u.disp === "subprime");
  const noPrice = retailNoPrice(units);
  const stale7 = retailStale(units, 7);
  const ages = units.map((u) => u.age).filter((a): a is number => a != null);
  const avgAge =
    ages.length > 0
      ? Math.round((ages.reduce((s, a) => s + a, 0) / ages.length) * 10) / 10
      : null;
  const over60 = units.filter((u) => (u.age ?? 0) > 60);
  const over90 = units.filter((u) => (u.age ?? 0) >= 90);
  const hot = hotUnits(units, snapshotDate);
  const hotCost = hot.reduce((s, u) => s + (u.cost || 0), 0);
  const ttl = ttlFailUnits(units);
  const noPh = units.filter((u) => (u.ph ?? 0) === 0);
  const tempPh = units.filter((u) => (u.ph ?? 0) > 0 && (u.ph ?? 0) < 16);
  const skipped = seenButSkipped(units);
  const hotWater = hot.reduce((s, u) => s + (mmrWater(u) ?? 0), 0);

  const firstOfNextLabel = (() => {
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
    <div className="space-y-4">
      {/* Inventory Command–style on-lot overview (Acquire units only) */}
      <div
        className={`${icSans.variable} ${icDisplay.variable}`}
        style={{
          background: IC.bg,
          color: IC.text,
          borderRadius: 12,
          border: `1px solid ${IC.border}`,
          padding: 16,
          fontFamily: "var(--ic-font-sans), Inter, system-ui, sans-serif",
          fontSize: 14,
        }}
      >
        <div className="mb-3">
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.2em]"
            style={{ color: IC.muted }}
          >
            Acquire · On lot
          </p>
          <h2
            className="text-xl font-bold tracking-tight"
            style={{
              fontFamily: "var(--ic-font-display), Barlow Condensed, sans-serif",
              color: IC.text,
            }}
          >
            Inventory overview
          </h2>
          <p className="mt-1 text-xs" style={{ color: IC.muted }}>
            Same command board as Inventory Command — unsold Acquire purchases
            only (selected stores). Age uses live inventory age when matched,
            otherwise days since purchase.
          </p>
        </div>

        <div className="mb-4 flex flex-wrap gap-2.5">
          <IcKpi
            label="Units in stock"
            value={k}
            sub={buildToShort(k)}
            status={k >= INV_TARGETS.stock ? "ok" : "warn"}
          />
          <IcKpi
            label="Retail / Subprime"
            value={`${retailUnits.length} / ${sub.length}`}
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
            sub="needs live price-change days"
            status={stale7.length ? "warn" : "ok"}
          />
          <IcKpi
            label="Avg age"
            value={avgAge != null ? `${fmtNum(avgAge, 0)}d` : "—"}
            sub={`target ≤ ${INV_TARGETS.turnDays}d`}
            status={
              avgAge == null
                ? "neutral"
                : avgAge > INV_TARGETS.turnDays
                  ? "bad"
                  : "ok"
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

        <IcPanel
          title="What needs attention this week"
          note="auto-flagged from Acquire on-lot units"
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
              title={`${hot.length} units cross the 90 wall ${firstOfNextLabel}`}
              body={`${fmtMoneyCompact(hotCost)} at cost. MMR says ${fmtMoneyCompact(hotWater)} water if all wholesaled today — every week of drift makes the exit worse.`}
            />
            <IcAttention
              color={IC.orange}
              title={`${ttl.length} units past day ${INV_TARGETS.ttlDays} without full photos`}
              body={`${noPh.length} with zero photos, ${tempPh.length} with temp sets. High-SRP units without photos are burning free demand.`}
            />
            <IcAttention
              color={IC.yellow}
              title={`${stale7.length} units not repriced in 7+ days`}
              body={`${retailStale(units, 14).length} of them are 14+ days stale. Overpriced + stale + aged = the units that die on the lot. (Stale needs live price-change days from inventory sync.)`}
            />
            <IcAttention
              color={IC.yellow}
              title={`${skipped.length} units seen online but skipped`}
              body="300+ SRPs with under 1% VDP conversion. The thumbnail (price or photo) is losing."
            />
          </div>
        </IcPanel>
      </div>

      {/* Existing sold-performance overview (date-ranged) */}
      <div className="pc-buybox-head">
        <h2>Sold performance</h2>
        <p>Purchase-card economics in the selected date range.</p>
      </div>

      <div className="pc-kpi-grid">
        <div className="pc-kpi">
          <div className="pc-kpi-label">Units sold</div>
          <div className="pc-kpi-value">{fmtN(totalSold)}</div>
          <div className="pc-kpi-sub">In date range</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Retail units</div>
          <div className="pc-kpi-value">{fmtN(retail.retailCount)}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Avg front</div>
          <div className="pc-kpi-value">{fmt$(retail.avgFront)}</div>
          <div className="pc-kpi-sub">Retail only</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Avg back</div>
          <div className="pc-kpi-value">{fmt$(retail.avgBack)}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Avg total</div>
          <div className="pc-kpi-value">{fmt$(retail.avgTotal)}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Avg turn</div>
          <div
            className={cn(
              "pc-kpi-value",
              retail.avgTurn != null && retail.avgTurn > 45 && "red"
            )}
          >
            {retail.avgTurn == null ? "—" : `${fmtN(retail.avgTurn, 0)}d`}
          </div>
          <div className="pc-kpi-sub">Purchase → sold</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Trade %</div>
          <div className="pc-kpi-value">{fmtPct(retail.tradePct)}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Wholesale %</div>
          <div className="pc-kpi-value">{fmtPct(wholesalePct)}</div>
          <div className="pc-kpi-sub">{fmtN(wholesale.soldCount)} units</div>
        </div>
      </div>

      <div className="pc-kpi-grid">
        <div className="pc-kpi">
          <div className="pc-kpi-label">Avg wholesale P/L</div>
          <div
            className={cn(
              "pc-kpi-value",
              wholesale.avgWholesaleGross == null
                ? undefined
                : wholesale.avgWholesaleGross >= 0
                  ? "green"
                  : "red"
            )}
          >
            {fmt$(wholesale.avgWholesaleGross)}
          </div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Buy signals</div>
          <div className="pc-kpi-value green">{buyBox.buys.length}</div>
          <div className="pc-kpi-sub">min {minVolume} retail deals</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Red-lights</div>
          <div className="pc-kpi-value red">{buyBox.reds.length}</div>
          <div className="pc-kpi-sub">min {minVolume} retail deals</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Avg recon</div>
          <div className="pc-kpi-value">{fmt$(all.recon.avgRecon)}</div>
          <div className="pc-kpi-sub">
            {all.recon.avgVariance == null
              ? "Sold in range"
              : `vs est ${all.recon.avgVariance > 0 ? "+" : ""}${fmt$(all.recon.avgVariance)}`}
          </div>
        </div>
      </div>

      <div className="pc-pill-row">
        <button type="button" className="pc-link" onClick={onOpenBuyBox}>
          Open Buy-Box →
        </button>
        <button type="button" className="pc-link" onClick={onOpenSources}>
          Open Sources →
        </button>
      </div>

      <section className="pc-stocking">
        <div className="pc-buybox-head">
          <h2>Exit mix</h2>
          <p>Sold + Arbitration Complete in the selected date range.</p>
        </div>
        <div className="pc-kpi-grid">
          {exitMix.map((row) => (
            <div key={row.strategy} className="pc-kpi">
              <div className="pc-kpi-label">{row.label}</div>
              <div className="pc-kpi-value">{fmtN(row.count)}</div>
              <div className="pc-kpi-sub">
                {row.avgGross != null ? `avg ${fmt$(row.avgGross)}` : "—"}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="pc-stocking">
        <div className="pc-buybox-head">
          <h2>Retail volume by make</h2>
          <p>Prime / Subprime / Cash only.</p>
        </div>
        {byMake.length === 0 ? (
          <p className="pc-muted">No retail sold units in this cut.</p>
        ) : (
          <div className="space-y-2">
            {byMake.slice(0, 12).map((row) => (
              <div
                key={row.key}
                className="flex items-center gap-3"
                style={{ fontSize: 12 }}
              >
                <div
                  className="w-28 shrink-0 truncate font-semibold"
                  style={{ color: "var(--da-text)" }}
                >
                  {row.label}
                </div>
                <div
                  className="h-2 flex-1 overflow-hidden rounded"
                  style={{ background: "var(--da-line)" }}
                >
                  <div
                    className="h-full rounded"
                    style={{
                      width: `${(row.retailCount / maxMakeVol) * 100}%`,
                      background: "var(--da-amber)",
                    }}
                  />
                </div>
                <div
                  className="w-10 text-right tabular-nums"
                  style={{ color: "var(--da-text)" }}
                >
                  {row.retailCount}
                </div>
                <div
                  className="w-20 text-right tabular-nums"
                  style={{ color: "var(--da-muted)" }}
                >
                  {fmt$(row.avgTotal)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
