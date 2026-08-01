import { fmtNum } from "@/lib/inventory-command/format";
import type { InvUnitRow } from "@/lib/inventory-command/types";

export default function MixTab({ units }: { units: InvUnitRow[] }) {
  const byBody = countBy(units, (u) => u.body?.trim() || "Unknown");
  const byDisp = countBy(units, (u) => u.disp);
  const byAge = countBy(units, (u) => ageBand(u.age));

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <MixTable title="By body" rows={byBody} total={units.length} />
      <MixTable title="By disposition" rows={byDisp} total={units.length} />
      <MixTable title="By age band" rows={byAge} total={units.length} />
    </div>
  );
}

function ageBand(age: number | null): string {
  if (age == null) return "Unknown";
  if (age < 15) return "0–14";
  if (age < 30) return "15–29";
  if (age < 45) return "30–44";
  if (age < 60) return "45–59";
  if (age < 90) return "60–89";
  return "90+";
}

function countBy(units: InvUnitRow[], keyFn: (u: InvUnitRow) => string) {
  const map = new Map<string, number>();
  for (const u of units) {
    const k = keyFn(u);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

function MixTable({
  title,
  rows,
  total,
}: {
  title: string;
  rows: { label: string; count: number }[];
  total: number;
}) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-3 py-2 text-sm font-semibold text-foreground">
        {title}
      </div>
      <table className="min-w-full text-left text-xs">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Segment</th>
            <th className="px-3 py-2 font-medium">Count</th>
            <th className="px-3 py-2 font-medium">%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-border">
              <td className="px-3 py-2 capitalize">{r.label}</td>
              <td className="px-3 py-2">{fmtNum(r.count)}</td>
              <td className="px-3 py-2">
                {total > 0 ? `${fmtNum((r.count / total) * 100, 1)}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
