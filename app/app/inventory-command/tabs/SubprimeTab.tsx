"use client";

import { SUBPRIME } from "@/lib/inventory-command/config";
import { fmtMoney } from "@/lib/inventory-command/format";
import { ageTone, IC } from "@/lib/inventory-command/midmo";
import {
  bookSpreadCandidates,
  reasonLabel,
  subprimeAuditFlags,
  subprimeInventory,
  type SubprimeAuditRow,
} from "@/lib/inventory-command/subprime";
import type { InvUnitRow } from "@/lib/inventory-command/types";
import { colAge, colCost, colPrice, colStock, colVeh } from "../ui/columns";
import { IcPanel } from "../ui/primitives";
import { IcTable, type IcCol } from "../ui/IcTable";

export default function SubprimeTab({ units }: { units: InvUnitRow[] }) {
  const audit = subprimeAuditFlags(units).sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0));
  const inventory = subprimeInventory(units).sort(
    (a, b) => (b.spread ?? -1e9) - (a.spread ?? -1e9)
  );
  const books = bookSpreadCandidates(units);

  const auditCols: IcCol<SubprimeAuditRow>[] = [
    colStock(),
    colVeh(),
    {
      key: "age",
      label: "Age",
      right: true,
      color: (u) => ageTone(u.age),
      render: (u) => u.age ?? "—",
    },
    colCost(),
    {
      key: "jd",
      label: "JD Trade",
      right: true,
      render: (u) => fmtMoney(u.jd),
    },
    {
      key: "spread",
      label: "JD - Cost",
      right: true,
      color: (u) => ((u.spread ?? 0) >= 0 ? IC.green : IC.red),
      render: (u) => fmtMoney(u.spread),
    },
    {
      key: "why",
      label: "Why flagged",
      sortable: false,
      render: (u) => u.reasons.map(reasonLabel).join(" · ") || "—",
    },
  ];

  const invCols: IcCol<SubprimeAuditRow>[] = [
    colStock(),
    colVeh(),
    {
      key: "age",
      label: "Age",
      right: true,
      color: (u) => ageTone(u.age),
      render: (u) => u.age ?? "—",
    },
    colCost(),
    {
      key: "jd",
      label: "JD Trade",
      right: true,
      render: (u) => fmtMoney(u.jd),
    },
    {
      key: "jd115",
      label: "115% JD",
      right: true,
      render: (u) => fmtMoney(u.jd115),
    },
    {
      key: "jd115MinusCost",
      label: "115% JD - Cost",
      right: true,
      color: (u) => ((u.jd115MinusCost ?? -1) >= 0 ? IC.green : IC.red),
      render: (u) => (u.jd115MinusCost != null ? fmtMoney(u.jd115MinusCost) : "—"),
    },
    colPrice(),
  ];

  const bookCols: IcCol<SubprimeAuditRow>[] = [
    colStock(),
    colVeh(),
    {
      key: "age",
      label: "Age",
      right: true,
      color: (u) => ageTone(u.age),
      render: (u) => u.age ?? "—",
    },
    colCost(),
    {
      key: "jd",
      label: "JD Trade",
      right: true,
      render: (u) => fmtMoney(u.jd),
    },
    {
      key: "spread",
      label: "Spread",
      right: true,
      color: (u) => ((u.spread ?? 0) >= 0 ? IC.green : IC.red),
      render: (u) => fmtMoney(u.spread),
    },
    {
      key: "jd115",
      label: "115% JD",
      right: true,
      render: (u) => fmtMoney(u.jd115),
    },
    {
      key: "jd115MinusCost",
      label: "115% JD - Cost",
      right: true,
      color: (u) => ((u.jd115MinusCost ?? -1) >= 0 ? IC.green : IC.red),
      render: (u) => (u.jd115MinusCost != null ? fmtMoney(u.jd115MinusCost) : "—"),
    },
    colPrice(),
    {
      key: "pom",
      label: "% Mkt",
      right: true,
      color: (u) => ((u.pom ?? 0) > 100 ? IC.yellow : IC.green),
      render: (u) => (u.pom == null ? "—" : `${u.pom.toFixed(1)}%`),
    },
  ];

  return (
    <div>
      <IcPanel
        title="Subprime audit — flagged as poor fit for the bucket"
        note={`rules: cost >$20K owned over book · cost >$25K without $3K+ spread · ${SUBPRIME.sellClockDays}+ days without cheap-cost/strong-spread exemption · no JD value`}
      >
        <IcTable cols={auditCols} rows={audit} defaultSort="cost" defaultDir="desc" maxH={420} />
      </IcPanel>

      <IcPanel
        title={`Subprime inventory — target = ${SUBPRIME.targetRetailJdMult * 100}% of JD Power trade-in`}
        note={`${SUBPRIME.sellClockDays}-day sell clock · under $20K cost ideal, $25K typical max · sorted by book spread`}
      >
        <IcTable cols={invCols} rows={inventory} defaultSort="spread" defaultDir="desc" maxH={420} />
      </IcPanel>

      <IcPanel
        title={`Book spreads — JD trade-in minus cost (JD ≤ $${(SUBPRIME.bookFinderJdMax / 1000).toFixed(0)}K, all inventory)`}
        note="subprime candidate finder · highest spread first"
      >
        <IcTable cols={bookCols} rows={books} defaultSort="spread" defaultDir="desc" maxH={520} />
      </IcPanel>
    </div>
  );
}
