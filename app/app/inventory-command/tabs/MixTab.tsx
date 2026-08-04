"use client";

import { useMemo } from "react";
import { INV_TARGETS } from "@/lib/inventory-command/config";
import { fmtMoneyCompact } from "@/lib/inventory-command/format";
import { IC, parseVehMakeModel } from "@/lib/inventory-command/midmo";
import type { InvUnitRow } from "@/lib/inventory-command/types";
import { IcPanel } from "../ui/primitives";

export default function MixTab({ units }: { units: InvUnitRow[] }) {
  const byMake = useMemo(() => {
    const map = new Map<string, InvUnitRow[]>();
    for (const u of units) {
      const { make } = parseVehMakeModel(u.veh);
      const list = map.get(make) ?? [];
      list.push(u);
      map.set(make, list);
    }
    return [...map.entries()]
      .map(([make, list]) => ({
        make,
        count: list.length,
        avgAge: list.reduce((s, u) => s + (u.age ?? 0), 0) / list.length,
        cost: list.reduce((s, u) => s + (u.cost || 0), 0),
      }))
      .sort((a, b) => b.count - a.count);
  }, [units]);

  const byModel = useMemo(() => {
    const map = new Map<string, InvUnitRow[]>();
    for (const u of units) {
      const { make, model } = parseVehMakeModel(u.veh);
      const key = model ? `${make} ${model}` : make;
      const list = map.get(key) ?? [];
      list.push(u);
      map.set(key, list);
    }
    return [...map.entries()]
      .map(([model, list]) => ({
        model,
        count: list.length,
        avgAge: list.reduce((s, u) => s + (u.age ?? 0), 0) / list.length,
      }))
      .filter((x) => x.count >= 3)
      .sort((a, b) => b.count - a.count);
  }, [units]);

  const maxCount = byMake[0]?.count ?? 1;

  return (
    <div>
      <IcPanel title="By make" note="count vs. avg age — long and slow is the red flag.">
        <div style={{ display: "grid", gap: 6 }}>
          {byMake.map((u) => {
            const slow = u.avgAge > INV_TARGETS.turnDays;
            const color = slow ? IC.red : IC.green;
            return (
              <div
                key={u.make}
                style={{
                  display: "grid",
                  gridTemplateColumns: "110px 1fr 150px",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div style={{ fontWeight: 600 }}>{u.make}</div>
                <div
                  style={{
                    height: 22,
                    borderRadius: 999,
                    background: IC.rowAlt,
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      width: `${Math.max(8, (u.count / maxCount) * 100)}%`,
                      height: "100%",
                      background: color,
                      borderRadius: 999,
                      display: "flex",
                      alignItems: "center",
                      paddingLeft: 8,
                      color: IC.darkText,
                      fontWeight: 700,
                      fontSize: 12,
                    }}
                  >
                    {u.count}
                  </div>
                </div>
                <div
                  style={{
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    color: slow ? IC.red : IC.muted,
                    fontSize: 13,
                  }}
                >
                  {u.avgAge.toFixed(0)}d avg · {fmtMoneyCompact(u.cost)}
                </div>
              </div>
            );
          })}
        </div>
      </IcPanel>

      <IcPanel
        title="Models with 3+ units"
        note="green turns fast — buy more. Red sits — red-light until cleared."
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
            gap: 8,
          }}
        >
          {byModel.map((u) => {
            const slow = u.avgAge > INV_TARGETS.turnDays;
            return (
              <div
                key={u.model}
                style={{
                  border: `1px solid ${slow ? IC.badBg : IC.okBg}`,
                  background: slow ? "#20161A" : "#14201B",
                  borderRadius: 10,
                  padding: "12px 14px",
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{u.model}</div>
                <div className="flex items-end justify-between">
                  <div
                    style={{
                      fontFamily: "var(--ic-font-display), 'Barlow Condensed', sans-serif",
                      fontSize: 32,
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                  >
                    {u.count}
                  </div>
                  <div
                    style={{
                      color: slow ? IC.red : IC.green,
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    {u.avgAge.toFixed(0)}d avg
                  </div>
                </div>
              </div>
            );
          })}
          {byModel.length === 0 ? (
            <p className="text-xs" style={{ color: IC.muted }}>
              No models with 3+ units.
            </p>
          ) : null}
        </div>
      </IcPanel>
    </div>
  );
}
