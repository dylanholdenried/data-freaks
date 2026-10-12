"use client";

import type { SoldResultRow } from "@/lib/inventory-command/acq-source";
import { fmtMoney, fmtNum } from "@/lib/inventory-command/format";
import { ageTone, IC } from "@/lib/inventory-command/midmo";
import { IcTable, type IcCol } from "./IcTable";
import { spreadTone } from "./SourceHealthTable";

export default function SoldResultsTable({
  rows,
  total,
  showStore,
}: {
  rows: SoldResultRow[];
  total: SoldResultRow;
  showStore: boolean;
}) {
  const cols: IcCol<SoldResultRow>[] = [
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
            render: (r: SoldResultRow) => r.storeName ?? (r.key === "__total" ? "All" : "—"),
          } satisfies IcCol<SoldResultRow>,
        ]
      : []),
    { key: "sold", label: "Sold", right: true, bold: true, render: (r) => fmtNum(r.sold) },
    {
      key: "avgFront",
      label: "Avg Front",
      right: true,
      color: (r) => spreadTone(r.avgFront),
      render: (r) => fmtMoney(r.avgFront),
    },
    {
      key: "avgBack",
      label: "Avg Back",
      right: true,
      color: (r) => spreadTone(r.avgBack),
      render: (r) => fmtMoney(r.avgBack),
    },
    {
      key: "avgTotal",
      label: "Avg Total Gross",
      right: true,
      bold: true,
      color: (r) => spreadTone(r.avgTotal),
      render: (r) => fmtMoney(r.avgTotal),
    },
    {
      key: "totalGross",
      label: "Total Gross",
      right: true,
      color: (r) => spreadTone(r.totalGross),
      render: (r) => fmtMoney(r.totalGross),
    },
    { key: "avgSalePrice", label: "Avg Sale Price", right: true, render: (r) => fmtMoney(r.avgSalePrice) },
    {
      key: "avgAgeAtSale",
      label: "Avg Age at Sale",
      right: true,
      color: (r) => ageTone(r.avgAgeAtSale),
      render: (r) => (r.avgAgeAtSale == null ? "—" : `${fmtNum(r.avgAgeAtSale, 0)}d`),
    },
  ];

  return (
    <IcTable
      cols={cols}
      rows={rows}
      footer={rows.length > 0 ? total : undefined}
      defaultSort="sold"
      defaultDir="desc"
      maxH={420}
      rowKey={(r) => r.key}
    />
  );
}
