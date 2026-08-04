"use client";

import { useMemo } from "react";
import { FULL_PHOTO_COUNT } from "@/lib/inventory-command/config";
import { isHotUnit } from "@/lib/inventory-command/compute";
import { fmtMoney, fmtNum } from "@/lib/inventory-command/format";
import { IC } from "@/lib/inventory-command/midmo";
import type {
  InvDailyMetrics,
  InvMovement,
  InvPriceAction,
  InvUnitRow,
} from "@/lib/inventory-command/types";
import { IcAttention, IcEmpty, IcPanel } from "../ui/primitives";
import { IcTable, type IcCol } from "../ui/IcTable";

function Sparkline({
  series,
  label,
  kfn,
  fmt = (n: number) => String(Math.round(n * 10) / 10),
  goodDir,
}: {
  series: InvDailyMetrics[];
  label: string;
  kfn: (m: InvDailyMetrics) => number | null | undefined;
  fmt?: (n: number) => string;
  goodDir: "up" | "down";
}) {
  const vals = series.map((m) => kfn(m) ?? 0);
  const first = vals[0] ?? 0;
  const last = vals[vals.length - 1] ?? 0;
  const delta = last - first;
  const days = Math.max(series.length - 1, 0);
  const bad = goodDir === "down" ? delta > 0 : delta < 0;
  const color = delta === 0 ? IC.muted : bad ? IC.red : IC.green;
  const w = 88;
  const h = 28;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const pts = vals
    .map((v, i) => {
      const x = vals.length <= 1 ? 0 : (i / (vals.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div
      style={{
        background: IC.panel,
        border: `1px solid ${IC.border}`,
        borderRadius: 10,
        padding: "12px 16px",
        flex: 1,
        minWidth: 165,
      }}
    >
      <div
        style={{
          color: IC.muted,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        {label}
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div>
          <div
            style={{
              fontFamily: "var(--ic-font-display), 'Barlow Condensed', sans-serif",
              fontSize: 28,
              fontWeight: 700,
              lineHeight: 1.1,
              color: IC.text,
            }}
          >
            {fmt(last)}
          </div>
          <div style={{ color, fontSize: 12 }}>
            {delta > 0 ? "+" : ""}
            {fmt(delta)}
            {days > 0 ? ` over ${days} days` : ""}
          </div>
        </div>
        {vals.length >= 2 ? (
          <svg width={w} height={h} aria-hidden>
            <polyline fill="none" stroke={color} strokeWidth={2} points={pts} />
          </svg>
        ) : null}
      </div>
    </div>
  );
}

export default function TrendsTab({
  history,
  units,
  movements,
  priceActions,
  snapshotDate,
}: {
  history: InvDailyMetrics[];
  units: InvUnitRow[];
  movements: InvMovement[];
  priceActions: InvPriceAction[];
  snapshotDate: string | null;
}) {
  const series = useMemo(
    () => [...history].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date)),
    [history]
  );

  if (series.length < 2) {
    return (
      <IcEmpty>
        Trends need at least two daily snapshots. Upload consecutive vAuto exports to unlock
        sparklines, the execution scoreboard, and movement / price-action history.
      </IcEmpty>
    );
  }

  const baseline = series[0]?.snapshot_date ?? "";
  const windowLabel = `${series[0]?.snapshot_date?.slice(5) ?? ""} → ${series[series.length - 1]?.snapshot_date?.slice(5) ?? ""}`;

  const exits = movements.filter((m) => m.type === "exit");
  const arrives = movements.filter((m) => m.type === "arrive");
  const cuts = priceActions.filter((p) => p.type === "cut");
  const newlyPriced = 0; // MidMo tracked first-price; our ingest skips those as actions

  const incompleteReachedFull = units.filter((u) => {
    if (u.d_ph == null) return false;
    const prevPh = (u.ph ?? 0) - u.d_ph;
    return prevPh < FULL_PHOTO_COUNT && (u.ph ?? 0) >= FULL_PHOTO_COUNT;
  });
  const stillIncompletePrev = units.filter((u) => {
    if (u.d_ph == null) return false;
    const prevPh = (u.ph ?? 0) - u.d_ph;
    return prevPh < FULL_PHOTO_COUNT;
  });

  const hot = snapshotDate ? units.filter((u) => isHotUnit(u.age, snapshotDate)) : [];
  const hotPriceMoves = hot.filter((u) => (u.d_p ?? 0) !== 0 && u.d_p != null).length;
  const hotLowVdpGain = hot.filter((u) => u.d_vdp != null && u.d_vdp <= 1).length;

  const shopperCols: IcCol<InvUnitRow>[] = [
    { key: "stk", label: "Stock #", bold: true },
    { key: "veh", label: "Vehicle" },
    {
      key: "age",
      label: "Age",
      right: true,
      color: () => IC.red,
      render: (u) => u.age ?? "—",
    },
    {
      key: "price",
      label: "Price",
      right: true,
      bold: true,
      render: (u) => fmtMoney(u.price),
    },
    {
      key: "d_p",
      label: "Δ Price (3d)",
      right: true,
      color: (u) => ((u.d_p ?? 0) < 0 ? IC.green : IC.muted),
      render: (u) => (u.d_p == null ? "—" : fmtMoney(u.d_p)),
    },
    {
      key: "d_vdp",
      label: "Δ VDP (3d)",
      right: true,
      color: (u) => {
        if (u.d_vdp == null) return IC.muted;
        return u.d_vdp <= 1 ? IC.red : IC.green;
      },
      render: (u) => (u.d_vdp == null ? "—" : fmtNum(u.d_vdp)),
    },
    {
      key: "d_srp",
      label: "Δ SRP (3d)",
      right: true,
      render: (u) => (u.d_srp == null ? "—" : fmtNum(u.d_srp)),
    },
  ];

  const moveCols: IcCol<InvMovement>[] = [
    {
      key: "movement_date",
      label: "Date",
      render: (m) => m.movement_date.slice(5),
    },
    {
      key: "type",
      label: "Move",
      render: (m) => (
        <span style={{ color: m.type === "exit" ? IC.green : IC.blue, fontWeight: 600 }}>
          {m.type === "exit" ? "EXIT" : "ARRIVED"}
        </span>
      ),
    },
    { key: "stk", label: "Stock #", bold: true },
    { key: "veh", label: "Vehicle" },
    { key: "age", label: "Age at move", right: true, render: (m) => m.age ?? "—" },
    { key: "cost", label: "Cost", right: true, render: (m) => fmtMoney(m.cost) },
  ];

  const priceCols: IcCol<InvPriceAction>[] = [
    { key: "stk", label: "Stock #", bold: true },
    { key: "veh", label: "Vehicle" },
    { key: "age", label: "Age", right: true, render: (p) => p.age ?? "—" },
    {
      key: "type",
      label: "Action",
      render: (p) => (
        <span style={{ color: p.type === "cut" ? IC.green : IC.blue, fontWeight: 600 }}>
          {p.type.toUpperCase()}
        </span>
      ),
    },
    {
      key: "d_p",
      label: "Δ Price",
      right: true,
      render: (p) => fmtMoney(p.d_p),
    },
    {
      key: "price",
      label: "Now",
      right: true,
      bold: true,
      render: (p) => fmtMoney(p.price),
    },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2.5">
        <Sparkline series={series} label="Units in stock" kfn={(m) => m.units} goodDir="up" />
        <Sparkline
          series={series}
          label="Avg age"
          kfn={(m) => m.avg_age}
          fmt={(n) => `${n.toFixed(1)}d`}
          goodDir="down"
        />
        <Sparkline series={series} label="Over 60 days" kfn={(m) => m.over60} goodDir="down" />
        <Sparkline series={series} label="Over 90 days" kfn={(m) => m.over90} goodDir="down" />
        <Sparkline
          series={series}
          label="TTL fails"
          kfn={(m) => m.ttl_fail}
          goodDir="down"
        />
        <Sparkline
          series={series}
          label="Stale prices (7d+)"
          kfn={(m) => m.stale}
          goodDir="down"
        />
      </div>

      <div
        className="mb-4 px-4 py-3 text-sm"
        style={{
          background: "#14201B",
          border: `1px solid ${IC.border}`,
          borderLeft: `3px solid ${IC.blue}`,
          borderRadius: 8,
          color: IC.muted,
        }}
      >
        Execution scoring live — baseline {baseline.slice(5)}. Movement, price actions, and
        per-unit deltas count from the {baseline.slice(5)} baseline forward. Trend lines show
        full history for context.
      </div>

      <IcPanel title="Execution scoreboard" note={`scored from baseline ${baseline.slice(5)} forward`}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            gap: 10,
          }}
        >
          <IcAttention
            color={exits.length >= 8 ? IC.green : IC.red}
            title={`${exits.length} units exited · ${arrives.length} arrived`}
            body="Selling pace vs arrivals is the first read on whether the lot is turning or bloating."
          />
          <IcAttention
            color={cuts.length > 0 ? IC.green : IC.red}
            title={`${cuts.length} price cuts · ${newlyPriced} units newly priced`}
            body="Stale units need price moves. Cuts on aged inventory are the signal that someone is working the book."
          />
          <IcAttention
            color={
              incompleteReachedFull.length / Math.max(stillIncompletePrev.length, 1) >= 0.2
                ? IC.green
                : IC.red
            }
            title={`${incompleteReachedFull.length} of ${stillIncompletePrev.length} incomplete units reached full photos`}
            body="Merchandising bottleneck. Units past day 5 without 16 photos are invisible demand."
          />
          <IcAttention
            color={hotPriceMoves > 0 ? IC.green : IC.red}
            title={`Hot list: ${hotPriceMoves} of ${hot.length} units got a price move`}
            body={`${hotLowVdpGain} hot-list units gained ≤1 VDP over the window — no shopper response at current price. Those aren't waiting for a buyer; they're waiting for a decision.`}
          />
        </div>
      </IcPanel>

      <IcPanel title="Inventory movement" note="exits (sold / wholesaled / removed) and new arrivals">
        <IcTable
          cols={moveCols}
          rows={movements}
          defaultSort="movement_date"
          defaultDir="asc"
          maxH={340}
          rowKey={(m, i) => `${m.stk}-${m.type}-${m.movement_date}-${i}`}
        />
      </IcPanel>

      <IcPanel title="Price action log" note={`every price change in the window · ${windowLabel}`}>
        <IcTable
          cols={priceCols}
          rows={priceActions}
          defaultSort="d_p"
          defaultDir="asc"
          maxH={340}
          rowKey={(p, i) => `${p.stk}-${p.action_date}-${i}`}
        />
      </IcPanel>

      <IcPanel
        title="Shopper response — 3-day VDP gain on the hot list"
        note="≤1 VDP gained = the market has voted at this price. Negative = old traffic rolling off with nothing replacing it."
      >
        <IcTable
          cols={shopperCols}
          rows={hot}
          defaultSort="d_vdp"
          defaultDir="desc"
          maxH={420}
        />
      </IcPanel>
    </div>
  );
}
