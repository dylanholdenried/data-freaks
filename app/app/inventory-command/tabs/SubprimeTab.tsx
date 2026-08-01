import { SUBPRIME } from "@/lib/inventory-command/config";
import { fmtMoney } from "@/lib/inventory-command/format";
import {
  bookSpreadCandidates,
  reasonLabel,
  subprimeAuditFlags,
  subprimeInventory,
} from "@/lib/inventory-command/subprime";
import type { InvUnitRow } from "@/lib/inventory-command/types";

export default function SubprimeTab({ units }: { units: InvUnitRow[] }) {
  const audit = subprimeAuditFlags(units);
  const inventory = subprimeInventory(units);
  const books = bookSpreadCandidates(units);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Subprime advertised price is ignored. Target retail ={" "}
        {SUBPRIME.targetRetailJdMult * 100}% of JD trade-in. Ideal cost ≤{" "}
        {fmtMoney(SUBPRIME.idealCostMax)}; acceptable ≤ {fmtMoney(SUBPRIME.acceptableCostMax)}.
        Sell clock {SUBPRIME.sellClockDays} days.
      </p>

      <Section title={`Daily audit (${audit.length})`}>
        {audit.length === 0 ? (
          <Empty>No flagged subprime units.</Empty>
        ) : (
          <table className="min-w-full text-left text-xs">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Stock</th>
                <th className="px-3 py-2 font-medium">Vehicle</th>
                <th className="px-3 py-2 font-medium">Age</th>
                <th className="px-3 py-2 font-medium">Cost</th>
                <th className="px-3 py-2 font-medium">JD Trade</th>
                <th className="px-3 py-2 font-medium">115% JD</th>
                <th className="px-3 py-2 font-medium">115% − Cost</th>
                <th className="px-3 py-2 font-medium">Reasons</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((u) => (
                <tr key={u.stk} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{u.stk}</td>
                  <td className="px-3 py-2">{u.veh}</td>
                  <td className="px-3 py-2">{u.age}</td>
                  <td className="px-3 py-2">{fmtMoney(u.cost)}</td>
                  <td className="px-3 py-2">{fmtMoney(u.jd)}</td>
                  <td className="px-3 py-2">{fmtMoney(u.jd115)}</td>
                  <td className="px-3 py-2">{fmtMoney(u.jd115MinusCost)}</td>
                  <td className="px-3 py-2">{u.reasons.map(reasonLabel).join("; ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title={`Full subprime inventory (${inventory.length}) — by JD−cost`}>
        <SpreadTable rows={inventory} />
      </Section>

      <Section
        title={`Book-spreads finder (JD ≤ ${fmtMoney(SUBPRIME.bookFinderJdMax)}) — all inventory`}
      >
        <SpreadTable rows={books} showDisp />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-foreground">{title}</h3>
      <div className="overflow-x-auto rounded-lg border border-border">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-center text-xs text-muted-foreground">{children}</p>;
}

function SpreadTable({
  rows,
  showDisp,
}: {
  rows: ReturnType<typeof subprimeInventory>;
  showDisp?: boolean;
}) {
  if (rows.length === 0) return <Empty>None</Empty>;
  return (
    <table className="min-w-full text-left text-xs">
      <thead className="bg-muted text-muted-foreground">
        <tr>
          <th className="px-3 py-2 font-medium">Stock</th>
          <th className="px-3 py-2 font-medium">Vehicle</th>
          <th className="px-3 py-2 font-medium">Age</th>
          <th className="px-3 py-2 font-medium">Cost</th>
          <th className="px-3 py-2 font-medium">JD Trade</th>
          <th className="px-3 py-2 font-medium">JD−Cost</th>
          <th className="px-3 py-2 font-medium">115% JD</th>
          <th className="px-3 py-2 font-medium">115% − Cost</th>
          {showDisp ? <th className="px-3 py-2 font-medium">Disp</th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((u) => (
          <tr key={u.stk} className="border-t border-border">
            <td className="px-3 py-2 font-medium">{u.stk}</td>
            <td className="px-3 py-2">{u.veh}</td>
            <td className="px-3 py-2">{u.age}</td>
            <td className="px-3 py-2">{fmtMoney(u.cost)}</td>
            <td className="px-3 py-2">{fmtMoney(u.jd)}</td>
            <td className="px-3 py-2">{fmtMoney(u.spread)}</td>
            <td className="px-3 py-2">{fmtMoney(u.jd115)}</td>
            <td className="px-3 py-2">{fmtMoney(u.jd115MinusCost)}</td>
            {showDisp ? <td className="px-3 py-2 capitalize">{u.disp}</td> : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
