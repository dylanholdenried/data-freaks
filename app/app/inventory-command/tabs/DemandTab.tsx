import { fmtMoney, fmtNum, fmtPct } from "@/lib/inventory-command/format";
import type { InvUnitRow } from "@/lib/inventory-command/types";

/** Seen but skipped: age≥7, srp≥300, vr < 1 (under 1% VDP conversion). */
export default function DemandTab({ units }: { units: InvUnitRow[] }) {
  const skipped = units
    .filter((u) => (u.age ?? 0) >= 7 && (u.srp ?? 0) >= 300 && u.vr != null && u.vr < 1)
    .sort((a, b) => (a.vr ?? 0) - (b.vr ?? 0));

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Seen but skipped: age ≥ 7, SRP ≥ 300, VR &lt; 1% (VDP÷SRP).{" "}
        <span className="font-semibold">{skipped.length}</span> units.
      </p>
      {skipped.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-muted px-4 py-8 text-center text-sm text-muted-foreground">
          No skipped units match the filter.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Stock</th>
                <th className="px-3 py-2 font-medium">Vehicle</th>
                <th className="px-3 py-2 font-medium">Age</th>
                <th className="px-3 py-2 font-medium">SRP</th>
                <th className="px-3 py-2 font-medium">VDP</th>
                <th className="px-3 py-2 font-medium">VR %</th>
                <th className="px-3 py-2 font-medium">Price</th>
                <th className="px-3 py-2 font-medium">Δ VDP</th>
              </tr>
            </thead>
            <tbody>
              {skipped.map((u) => (
                <tr key={u.stk} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{u.stk}</td>
                  <td className="px-3 py-2">{u.veh}</td>
                  <td className="px-3 py-2">{u.age}</td>
                  <td className="px-3 py-2">{fmtNum(u.srp)}</td>
                  <td className="px-3 py-2">{fmtNum(u.vdp)}</td>
                  <td className="px-3 py-2">{fmtPct(u.vr, 2)}</td>
                  <td className="px-3 py-2">{fmtMoney(u.price)}</td>
                  <td className="px-3 py-2">{u.d_vdp ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
