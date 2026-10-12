"use client";

import type { SourceHealthRow } from "@/lib/inventory-command/acq-source";
import { INV_TARGETS } from "@/lib/inventory-command/config";
import { fmtMoney, fmtNum, fmtPct } from "@/lib/inventory-command/format";
import {
  AGE_BUCKET_COLORS,
  AGE_BUCKETS,
  ageTone,
  IC,
  pomTone,
} from "@/lib/inventory-command/midmo";
import { IcTable, type IcCol } from "./IcTable";

export function ctmTone(ctm: number | null | undefined): string {
  if (ctm == null) return IC.text;
  if (ctm <= 85) return IC.green;
  if (ctm <= 90) return IC.yellow;
  return IC.red;
}

export function spreadTone(n: number | null | undefined): string {
  if (n == null) return IC.muted;
  return n < 0 ? IC.red : IC.green;
}

function daysSupplyTone(n: number | null): string {
  if (n == null) return IC.muted;
  if (n <= INV_TARGETS.turnDays) return IC.green;
  if (n <= 60) return IC.yellow;
  return IC.red;
}

function countTone(n: number, bad: string): string {
  return n > 0 ? bad : IC.muted;
}

export default function SourceHealthTable({
  rows,
  total,
  soldWindowDays,
  showStore,
  activeKey,
  onSelect,
}: {
  rows: SourceHealthRow[];
  total: SourceHealthRow;
  soldWindowDays: number;
  showStore: boolean;
  activeKey: string | null;
  onSelect?: (row: SourceHealthRow) => void;
}) {
  const cols: IcCol<SourceHealthRow>[] = [
    {
      key: "label",
      label: "Source",
      bold: true,
      color: (r) => (r.key.startsWith("__none") ? IC.orange : undefined),
    },
    ...(showStore
      ? [
          {
            key: "storeName",
            label: "Store",
            render: (r: SourceHealthRow) => r.storeName ?? (r.key === "__total" ? "All" : "—"),
          } satisfies IcCol<SourceHealthRow>,
        ]
      : []),
    { key: "units", label: "Units", right: true, bold: true, render: (r) => fmtNum(r.units) },
    { key: "pctOfStock", label: "% Stock", right: true, render: (r) => fmtPct(r.pctOfStock, 0) },
    { key: "totalCost", label: "Total Cost", right: true, render: (r) => fmtMoney(r.totalCost) },
    { key: "avgCost", label: "Avg Cost", right: true, render: (r) => fmtMoney(r.avgCost) },
    { key: "avgPrice", label: "Avg Price", right: true, render: (r) => fmtMoney(r.avgPrice) },
    {
      key: "avgMarkup",
      label: "Avg Markup",
      right: true,
      color: (r) => spreadTone(r.avgMarkup),
      render: (r) => fmtMoney(r.avgMarkup),
    },
    { key: "markupPct", label: "Markup %", right: true, render: (r) => fmtPct(r.markupPct, 1) },
    {
      key: "avgPom",
      label: "Avg % Mkt",
      right: true,
      color: (r) => pomTone(r.avgPom),
      render: (r) => fmtPct(r.avgPom, 1),
    },
    {
      key: "avgCtm",
      label: "Avg Cost to Mkt",
      right: true,
      color: (r) => ctmTone(r.avgCtm),
      render: (r) => fmtPct(r.avgCtm, 1),
    },
    {
      key: "avgMmrSpread",
      label: "MMR − Cost",
      right: true,
      color: (r) => spreadTone(r.avgMmrSpread),
      render: (r) => fmtMoney(r.avgMmrSpread),
    },
    {
      key: "avgJdSpread",
      label: "JD − Cost",
      right: true,
      color: (r) => spreadTone(r.avgJdSpread),
      render: (r) => fmtMoney(r.avgJdSpread),
    },
    {
      key: "avgBbSpread",
      label: "BB − Cost",
      right: true,
      color: (r) => spreadTone(r.avgBbSpread),
      render: (r) => fmtMoney(r.avgBbSpread),
    },
    { key: "avgOdometer", label: "Avg Miles", right: true, render: (r) => fmtNum(r.avgOdometer) },
    {
      key: "avgAge",
      label: "Avg Age",
      right: true,
      color: (r) => ageTone(r.avgAge),
      render: (r) => (r.avgAge == null ? "—" : `${fmtNum(r.avgAge, 0)}d`),
    },
    ...AGE_BUCKETS.map(
      (b): IcCol<SourceHealthRow> => ({
        key: `bucket_${b}`,
        label: b,
        right: true,
        color: (r) => (r.buckets[b] > 0 ? AGE_BUCKET_COLORS[b] : IC.muted),
        render: (r) => fmtNum(r.buckets[b]),
        sortValue: (r) => r.buckets[b],
      })
    ),
    {
      key: "pctOver60",
      label: "% Over 60",
      right: true,
      color: (r) => ((r.pctOver60 ?? 0) > 0 ? IC.orange : IC.muted),
      render: (r) => fmtPct(r.pctOver60, 0),
    },
    {
      key: "hot",
      label: "Hot",
      right: true,
      color: (r) => countTone(r.hot, IC.red),
      render: (r) => fmtNum(r.hot),
    },
    {
      key: "noPrice",
      label: "No Price",
      right: true,
      color: (r) => countTone(r.noPrice, IC.yellow),
      render: (r) => fmtNum(r.noPrice),
    },
    {
      key: "photoGaps",
      label: "Photo Gaps",
      right: true,
      color: (r) => countTone(r.photoGaps, IC.yellow),
      render: (r) => fmtNum(r.photoGaps),
    },
    {
      key: "stale",
      label: "Stale 7d+",
      right: true,
      color: (r) => countTone(r.stale, IC.orange),
      render: (r) => fmtNum(r.stale),
    },
    { key: "avgSpd", label: "SRP / Day", right: true, render: (r) => fmtNum(r.avgSpd, 1) },
    { key: "vdpConv", label: "VDP Conv", right: true, render: (r) => fmtPct(r.vdpConv, 2) },
    {
      key: "mix",
      label: "Retail / Sub / Whsl",
      right: true,
      sortable: false,
      render: (r) => `${r.retail} / ${r.subprime} / ${r.wholesale}`,
    },
    { key: "arrivals30", label: "In 30d", right: true, render: (r) => fmtNum(r.arrivals30) },
    { key: "exits30", label: "Out 30d", right: true, render: (r) => fmtNum(r.exits30) },
    {
      key: "avgExitAge",
      label: "Exit Age",
      right: true,
      render: (r) => (r.avgExitAge == null ? "—" : `${fmtNum(r.avgExitAge, 0)}d`),
    },
    {
      key: "sold",
      label: `Sold ${soldWindowDays}d`,
      right: true,
      render: (r) => fmtNum(r.sold),
    },
    {
      key: "daysSupply",
      label: "Days Supply",
      right: true,
      color: (r) => daysSupplyTone(r.daysSupply),
      render: (r) => (r.daysSupply == null ? "—" : fmtNum(r.daysSupply, 0)),
    },
    {
      key: "soldToStock",
      label: "Sold / Stock",
      right: true,
      render: (r) => (r.soldToStock == null ? "—" : fmtNum(r.soldToStock, 2)),
    },
  ];

  return (
    <IcTable
      cols={cols}
      rows={rows}
      footer={total}
      defaultSort="units"
      defaultDir="desc"
      maxH={520}
      rowKey={(r) => r.key}
      onRowClick={onSelect}
      isRowActive={(r) => activeKey != null && r.key === activeKey}
    />
  );
}
