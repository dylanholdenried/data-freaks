import { INV_TARGETS } from "@/lib/inventory-command/config";
import { isHotUnit } from "@/lib/inventory-command/compute";
import { fmtMoney, fmtNum } from "@/lib/inventory-command/format";
import type { InvDailyMetrics, InvMovement, InvUnitRow } from "@/lib/inventory-command/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function Kpi({
  label,
  value,
  target,
  warn,
}: {
  label: string;
  value: string;
  target?: string;
  warn?: boolean;
}) {
  return (
    <Card className={warn ? "border-amber-300" : undefined}>
      <CardHeader className="pb-1 pt-4">
        <CardTitle className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="text-2xl font-semibold text-foreground">{value}</div>
        {target ? <p className="mt-0.5 text-xs text-muted-foreground">Target {target}</p> : null}
      </CardContent>
    </Card>
  );
}

export default function OverviewTab({
  metrics,
  units,
  movements,
}: {
  metrics: InvDailyMetrics | null;
  units: InvUnitRow[];
  movements: InvMovement[];
}) {
  const hotUnits = units.filter((u) =>
    metrics ? isHotUnit(u.age, metrics.snapshot_date) : false
  );
  const arrives = movements.filter((m) => m.type === "arrive").length;
  const exits = movements.filter((m) => m.type === "exit").length;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Units in stock"
          value={fmtNum(metrics?.units)}
          target={String(INV_TARGETS.stock)}
          warn={(metrics?.units ?? 0) > INV_TARGETS.stock}
        />
        <Kpi
          label="Avg age"
          value={fmtNum(metrics?.avg_age, 1)}
          target={`${INV_TARGETS.turnDays}d`}
          warn={(metrics?.avg_age ?? 0) > INV_TARGETS.turnDays}
        />
        <Kpi
          label="Over 60 days"
          value={fmtNum(metrics?.over60)}
          target="0"
          warn={(metrics?.over60 ?? 0) > 0}
        />
        <Kpi
          label="Hot list cash"
          value={fmtMoney(metrics?.hot_cost)}
          target={`${fmtNum(metrics?.hot)} units`}
          warn={(metrics?.hot ?? 0) > 0}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Retail" value={fmtNum(metrics?.retail_count)} />
        <Kpi label="Subprime" value={fmtNum(metrics?.subprime_count)} />
        <Kpi
          label="Retail no price"
          value={fmtNum(metrics?.no_price)}
          warn={(metrics?.no_price ?? 0) > 0}
        />
        <Kpi
          label="Retail stale (≥7d)"
          value={fmtNum(metrics?.stale)}
          warn={(metrics?.stale ?? 0) > 0}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Full photos (≥16)" value={fmtNum(metrics?.full_photos)} />
        <Kpi label="No photos" value={fmtNum(metrics?.no_ph)} warn={(metrics?.no_ph ?? 0) > 0} />
        <Kpi label="Today moves" value={`${arrives} in / ${exits} out`} />
      </div>

      {hotUnits.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Hot list preview</h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Stock</th>
                  <th className="px-3 py-2 font-medium">Vehicle</th>
                  <th className="px-3 py-2 font-medium">Age</th>
                  <th className="px-3 py-2 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {hotUnits.slice(0, 8).map((u) => (
                  <tr key={u.stk} className="border-t border-border">
                    <td className="px-3 py-2 font-medium text-foreground">{u.stk}</td>
                    <td className="px-3 py-2 text-muted-foreground">{u.veh}</td>
                    <td className="px-3 py-2">{u.age}</td>
                    <td className="px-3 py-2">{fmtMoney(u.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
