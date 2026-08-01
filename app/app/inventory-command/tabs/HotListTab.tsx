import { hotAgeThreshold, isHotUnit } from "@/lib/inventory-command/compute";
import { fmtMoney } from "@/lib/inventory-command/format";
import type { InvUnitRow } from "@/lib/inventory-command/types";

export default function HotListTab({
  units,
  snapshotDate,
}: {
  units: InvUnitRow[];
  snapshotDate: string | null;
}) {
  if (!snapshotDate) {
    return <Empty>No snapshot date — upload inventory to see the hot list.</Empty>;
  }

  const threshold = hotAgeThreshold(snapshotDate);
  const hot = units
    .filter((u) => isHotUnit(u.age, snapshotDate))
    .sort((a, b) => (b.age ?? 0) - (a.age ?? 0));
  const cash = hot.reduce((s, u) => s + (u.cost ?? 0), 0);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Hot threshold today: age ≥ <span className="font-semibold">{threshold}</span> days
        (90 − days until 1st of next month).{" "}
        <span className="font-semibold">{hot.length}</span> units · {fmtMoney(cash)} cost tied up.
      </p>
      {hot.length === 0 ? (
        <Empty>No hot units for this snapshot.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Stock</th>
                <th className="px-3 py-2 font-medium">Vehicle</th>
                <th className="px-3 py-2 font-medium">Age</th>
                <th className="px-3 py-2 font-medium">Cost</th>
                <th className="px-3 py-2 font-medium">Price</th>
                <th className="px-3 py-2 font-medium">Disp</th>
                <th className="px-3 py-2 font-medium">PT</th>
              </tr>
            </thead>
            <tbody>
              {hot.map((u) => (
                <tr key={u.stk} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{u.stk}</td>
                  <td className="px-3 py-2">{u.veh}</td>
                  <td className="px-3 py-2">{u.age}</td>
                  <td className="px-3 py-2">{fmtMoney(u.cost)}</td>
                  <td className="px-3 py-2">{fmtMoney(u.price)}</td>
                  <td className="px-3 py-2 capitalize">{u.disp}</td>
                  <td className="px-3 py-2">{u.pt ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border bg-muted px-4 py-8 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}
