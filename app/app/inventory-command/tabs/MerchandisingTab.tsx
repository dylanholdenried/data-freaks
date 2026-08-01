import { FULL_PHOTO_COUNT } from "@/lib/inventory-command/config";
import { fmtNum } from "@/lib/inventory-command/format";
import type { InvUnitRow } from "@/lib/inventory-command/types";

export default function MerchandisingTab({ units }: { units: InvUnitRow[] }) {
  const noPh = units.filter((u) => (u.ph ?? 0) === 0);
  const partial = units.filter((u) => (u.ph ?? 0) > 0 && (u.ph ?? 0) < FULL_PHOTO_COUNT);
  const full = units.filter((u) => (u.ph ?? 0) >= FULL_PHOTO_COUNT);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Full (≥16 photos)" value={full.length} />
        <Stat label="Partial" value={partial.length} />
        <Stat label="No photos" value={noPh.length} warn={noPh.length > 0} />
      </div>

      <Section title={`No photos (${noPh.length})`}>
        <UnitTable rows={noPh} />
      </Section>
      <Section title={`Partial photos (${partial.length})`}>
        <UnitTable rows={partial} />
      </Section>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 ${warn ? "border-[color-mix(in_srgb,var(--da-amber)_45%,transparent)] bg-[color-mix(in_srgb,var(--da-amber)_12%,transparent)]" : "border-border bg-card"}`}
    >
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold text-foreground">{fmtNum(value)}</div>
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

function UnitTable({ rows }: { rows: InvUnitRow[] }) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">None</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="min-w-full text-left text-xs">
        <thead className="bg-muted text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Stock</th>
            <th className="px-3 py-2 font-medium">Vehicle</th>
            <th className="px-3 py-2 font-medium">Age</th>
            <th className="px-3 py-2 font-medium">Photos</th>
            <th className="px-3 py-2 font-medium">Δ Photos</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => (
            <tr key={u.stk} className="border-t border-border">
              <td className="px-3 py-2 font-medium">{u.stk}</td>
              <td className="px-3 py-2">{u.veh}</td>
              <td className="px-3 py-2">{u.age}</td>
              <td className="px-3 py-2">{u.ph ?? 0}</td>
              <td className="px-3 py-2">{u.d_ph ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
