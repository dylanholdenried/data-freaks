"use client";

import { useMemo, useState } from "react";
import {
  AGE_BUCKETS,
  AGE_BUCKET_COLORS,
  ageBucket,
  IC,
  type AgeBucket,
} from "@/lib/inventory-command/midmo";
import { fmtMoney, fmtMoneyCompact } from "@/lib/inventory-command/format";
import type { InvUnitRow } from "@/lib/inventory-command/types";

export function AgeWall({ units }: { units: InvUnitRow[] }) {
  const [hover, setHover] = useState<InvUnitRow | null>(null);
  const sorted = useMemo(
    () => [...units].filter((u) => u.age != null).sort((a, b) => (a.age ?? 0) - (b.age ?? 0)),
    [units]
  );
  const maxCost = Math.max(...sorted.map((u) => u.cost || 0), 1);

  if (sorted.length === 0) {
    return (
      <p className="text-xs" style={{ color: IC.muted }}>
        No units to chart.
      </p>
    );
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 1,
          height: 110,
          position: "relative",
        }}
      >
        {sorted.map((u) => {
          const h = Math.max(8, ((u.cost || 8000) / maxCost) * 100);
          const bucket = ageBucket(u.age);
          return (
            <div
              key={u.stk}
              onMouseEnter={() => setHover(u)}
              onMouseLeave={() => setHover(null)}
              title={`${u.stk} · ${u.veh ?? ""} · ${u.age}d · ${fmtMoney(u.cost)}`}
              style={{
                flex: 1,
                minWidth: 2,
                maxWidth: 14,
                height: `${h}%`,
                background: AGE_BUCKET_COLORS[bucket],
                borderRadius: "2px 2px 0 0",
                opacity: hover && hover.stk !== u.stk ? 0.35 : 1,
                cursor: "default",
              }}
            />
          );
        })}
      </div>
      <div
        className="mt-2 flex justify-between text-[11px]"
        style={{ color: IC.muted }}
      >
        <span>← freshest</span>
        <span>oldest →</span>
      </div>
      {hover ? (
        <div className="mt-2 text-xs" style={{ color: IC.text }}>
          <span style={{ fontWeight: 600 }}>{hover.stk}</span>
          {" · "}
          {hover.veh}
          {" · "}
          <span style={{ color: AGE_BUCKET_COLORS[ageBucket(hover.age)] }}>{hover.age}d</span>
          {" · "}
          {fmtMoney(hover.cost)} cost
        </div>
      ) : (
        <div className="mt-2 text-xs" style={{ color: IC.muted }}>
          Every unit on the lot. Height = cash in the unit. Color = age bucket. Hover any bar.
        </div>
      )}
    </div>
  );
}

export function AgeBuckets({ units }: { units: InvUnitRow[] }) {
  const rows = useMemo(() => {
    return AGE_BUCKETS.map((b) => {
      const list = units.filter((u) => ageBucket(u.age) === b);
      return {
        b: b as AgeBucket,
        count: list.length,
        cost: list.reduce((s, u) => s + (u.cost || 0), 0),
      };
    });
  }, [units]);

  const total = units.length || 1;

  return (
    <div>
      <div
        style={{
          display: "flex",
          height: 46,
          borderRadius: 8,
          overflow: "hidden",
          marginBottom: 10,
        }}
      >
        {rows.map(
          (u) =>
            u.count > 0 && (
              <div
                key={u.b}
                style={{
                  flex: u.count,
                  background: AGE_BUCKET_COLORS[u.b],
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: IC.darkText,
                  fontWeight: 700,
                  fontSize: 15,
                  fontFamily: "var(--ic-font-display), 'Barlow Condensed', sans-serif",
                }}
              >
                {u.count}
              </div>
            )
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: IC.muted }}>
        {rows.map((u) => (
          <span key={u.b}>
            <span style={{ color: AGE_BUCKET_COLORS[u.b], fontWeight: 700 }}>{u.b}</span>
            {" · "}
            {u.count} ({Math.round((u.count / total) * 100)}%) · {fmtMoneyCompact(u.cost)}
          </span>
        ))}
      </div>
    </div>
  );
}
