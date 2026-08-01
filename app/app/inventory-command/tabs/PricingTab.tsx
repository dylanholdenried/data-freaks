import { OVER_MARKET_POM, STALE_14_DAYS, STALE_DAYS } from "@/lib/inventory-command/config";
import { fmtMoney, fmtPct } from "@/lib/inventory-command/format";
import type { InvUnitRow } from "@/lib/inventory-command/types";

export default function PricingTab({ units }: { units: InvUnitRow[] }) {
  const retail = units.filter((u) => u.disp === "retail");
  const reprice = retail.filter((u) => (u.dsr ?? 0) >= STALE_DAYS);
  const noPrice = retail.filter((u) => u.price == null);
  const stale14 = retail.filter((u) => (u.dsr ?? 0) >= STALE_14_DAYS);
  const overMarket = retail.filter((u) => (u.pom ?? 0) >= OVER_MARKET_POM);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Repricing queue (dsr≥7)" value={reprice.length} warn />
        <Tile label="No price set" value={noPrice.length} warn={noPrice.length > 0} />
        <Tile label="Stale 14+" value={stale14.length} warn={stale14.length > 0} />
        <Tile label={`Over ${OVER_MARKET_POM}% market`} value={overMarket.length} warn={overMarket.length > 0} />
      </div>

      <Section title="Repricing queue">
        <PriceTable rows={reprice} />
      </Section>
      <Section title="No price set">
        <PriceTable rows={noPrice} />
      </Section>
      <Section title="Over market">
        <PriceTable rows={overMarket} showPom />
      </Section>
    </div>
  );
}

function Tile({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 ${warn ? "border-[color-mix(in_srgb,var(--da-amber)_45%,transparent)] bg-[color-mix(in_srgb,var(--da-amber)_12%,transparent)]" : "border-border bg-card"}`}
    >
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

function PriceTable({ rows, showPom }: { rows: InvUnitRow[]; showPom?: boolean }) {
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">None</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="min-w-full text-left text-xs">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Stock</th>
            <th className="px-3 py-2 font-medium">Vehicle</th>
            <th className="px-3 py-2 font-medium">Age</th>
            <th className="px-3 py-2 font-medium">Price</th>
            <th className="px-3 py-2 font-medium">Δ$</th>
            <th className="px-3 py-2 font-medium">Days since Δ</th>
            {showPom ? <th className="px-3 py-2 font-medium">% Mkt</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.stk} className="border-t border-border">
              <td className="px-3 py-2 font-medium">{u.stk}</td>
              <td className="px-3 py-2">{u.veh}</td>
              <td className="px-3 py-2">{u.age}</td>
              <td className="px-3 py-2">{fmtMoney(u.price)}</td>
              <td className="px-3 py-2">{u.d_p != null ? fmtMoney(u.d_p) : "—"}</td>
              <td className="px-3 py-2">{u.dsr ?? "—"}</td>
              {showPom ? <td className="px-3 py-2">{fmtPct(u.pom)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
