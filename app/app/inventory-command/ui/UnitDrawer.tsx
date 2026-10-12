"use client";

import { useEffect, useState } from "react";
import { excelSerialToDate } from "@/lib/inventory-command/compute";
import type { TaggedUnit } from "@/lib/inventory-command/acq-source";
import { IC } from "@/lib/inventory-command/midmo";
import { getInventoryUnitRawAction } from "../actions";
import { UNIT_COLUMNS } from "./InventoryUnitTable";

type RawRow = Record<string, string | number | boolean>;

function formatRawValue(header: string, v: string | number | boolean): string {
  if (typeof v !== "number") return String(v);
  const h = header.toLowerCase();
  if (h.includes("change") && v > 20000 && v < 80000) {
    return excelSerialToDate(v).toISOString().slice(0, 10);
  }
  if ((h.includes("%") || h.includes("of market") || h.includes("cost to market")) && Math.abs(v) <= 2) {
    return `${(v * 100).toFixed(1)}%`;
  }
  return Number.isInteger(v) ? v.toLocaleString("en-US") : v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export default function UnitDrawer({
  unit,
  onClose,
}: {
  unit: TaggedUnit | null;
  onClose: () => void;
}) {
  const [raw, setRaw] = useState<RawRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storeId = unit?.storeId;
  const snapshotDate = unit?.snapshotDate;
  const stk = unit?.stk;

  useEffect(() => {
    if (!storeId || !snapshotDate || !stk) return;
    let cancelled = false;
    setRaw(null);
    setError(null);
    setLoading(true);
    getInventoryUnitRawAction({ storeId, snapshotDate, stk })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setRaw(res.raw);
        else setError(res.error);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId, snapshotDate, stk]);

  const open = unit != null;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!unit) return null;

  const fields = UNIT_COLUMNS.filter((c) => c.key !== "stk");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Unit ${unit.stk}`}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 50,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100vw)",
          height: "100%",
          overflowY: "auto",
          background: IC.bg,
          borderLeft: `1px solid ${IC.border}`,
          padding: 20,
          color: IC.text,
        }}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div style={{ color: IC.yellow, fontSize: 11, fontWeight: 700, letterSpacing: 1.2 }}>
              STOCK #{unit.stk}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>{unit.veh ?? "—"}</div>
            <div style={{ color: IC.muted, fontSize: 12, marginTop: 4 }}>
              {unit.vin ?? "No VIN"} · {unit.storeName}
            </div>
            <div style={{ fontSize: 12, marginTop: 6 }}>
              Source:{" "}
              <strong style={{ color: unit.source ? IC.text : IC.orange }}>
                {unit.source ?? "Needs tag"}
              </strong>
              {unit.sourceOrigin ? (
                <span style={{ color: IC.muted }}>
                  {" "}
                  ({unit.sourceOrigin === "manual" ? "manual" : "stock # rule"})
                </span>
              ) : null}
              {unit.sourceNote ? (
                <div style={{ color: IC.muted, marginTop: 2 }}>{unit.sourceNote}</div>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: `1px solid ${IC.border}`,
              borderRadius: 8,
              padding: "4px 10px",
              color: IC.text,
              background: IC.panel,
              fontSize: 12,
            }}
          >
            Close
          </button>
        </div>

        <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide" style={{ color: IC.muted }}>
          Key numbers
        </h3>
        <dl
          className="mb-5"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", fontSize: 13 }}
        >
          {fields.map((c) => (
            <div key={c.key} className="flex justify-between gap-2" style={{ borderBottom: `1px solid ${IC.line}` }}>
              <dt style={{ color: IC.muted }}>{c.label}</dt>
              <dd style={{ color: c.color?.(unit) ?? IC.text, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                {c.render ? c.render(unit) : (c.value(unit) ?? "—")}
              </dd>
            </div>
          ))}
        </dl>

        <h3 className="mb-2 text-[12px] font-bold uppercase tracking-wide" style={{ color: IC.muted }}>
          Every column from the upload
        </h3>
        {loading ? (
          <p className="text-xs" style={{ color: IC.muted }}>
            Loading…
          </p>
        ) : error ? (
          <p className="text-xs" style={{ color: IC.red }}>
            {error}
          </p>
        ) : !raw ? (
          <p className="text-xs" style={{ color: IC.muted }}>
            This snapshot was uploaded before full rows were saved. Re-upload today&apos;s export to
            see every column.
          </p>
        ) : (
          <dl style={{ fontSize: 13 }}>
            {Object.entries(raw).map(([k, v]) => (
              <div
                key={k}
                className="flex justify-between gap-4 py-1"
                style={{ borderBottom: `1px solid ${IC.line}` }}
              >
                <dt style={{ color: IC.muted }}>{k}</dt>
                <dd style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {formatRawValue(k, v)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}
