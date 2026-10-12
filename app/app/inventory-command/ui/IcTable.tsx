"use client";

import { useMemo, useState } from "react";
import { IC } from "@/lib/inventory-command/midmo";

export type IcCol<T> = {
  key: string;
  label: string;
  right?: boolean;
  bold?: boolean;
  sortable?: boolean;
  color?: (row: T) => string | undefined;
  render?: (row: T) => React.ReactNode;
  /** Value used for sorting when different from row[key] */
  sortValue?: (row: T) => string | number | null | undefined;
};

function renderCell<T>(c: IcCol<T>, row: T, isFooter: boolean) {
  const raw = (row as unknown as Record<string, unknown>)[c.key];
  const content = c.render ? c.render(row) : raw == null || raw === "" ? "—" : String(raw);
  return (
    <td
      key={c.key}
      style={{
        padding: "7px 8px",
        textAlign: c.right ? "right" : "left",
        whiteSpace: "nowrap",
        borderBottom: `1px solid ${IC.line}`,
        borderTop: isFooter ? `1px solid ${IC.border}` : undefined,
        color: c.color?.(row) || "inherit",
        fontWeight: c.bold || isFooter ? 600 : 400,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {content}
    </td>
  );
}

export function IcTable<T extends object>({
  cols,
  rows,
  defaultSort,
  defaultDir = "desc",
  maxH = 420,
  rowKey,
  onRowClick,
  isRowActive,
  footer,
}: {
  cols: IcCol<T>[];
  rows: T[];
  defaultSort?: string;
  defaultDir?: "asc" | "desc";
  maxH?: number;
  rowKey?: (row: T, i: number) => string;
  onRowClick?: (row: T) => void;
  isRowActive?: (row: T) => boolean;
  /** Pinned summary row (e.g. totals), not sorted. */
  footer?: T;
}) {
  const [sortKey, setSortKey] = useState(defaultSort ?? cols[0]?.key);
  const [dir, setDir] = useState<"asc" | "desc">(defaultDir);

  const sorted = useMemo(() => {
    const list = [...rows];
    const col = cols.find((c) => c.key === sortKey);
    list.sort((a, b) => {
      const rowA = a as unknown as Record<string, unknown>;
      const rowB = b as unknown as Record<string, unknown>;
      const av = col?.sortValue
        ? col.sortValue(a)
        : (rowA[sortKey ?? ""] as string | number | null | undefined);
      const bv = col?.sortValue
        ? col.sortValue(b)
        : (rowB[sortKey ?? ""] as string | number | null | undefined);
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return dir === "asc" ? -1 : 1;
      if (av > bv) return dir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [rows, sortKey, dir, cols]);

  function onHeader(key: string, sortable?: boolean) {
    if (sortable === false) return;
    if (sortKey === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setDir("desc");
    }
  }

  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-xs" style={{ color: IC.muted }}>
        None
      </p>
    );
  }

  return (
    <div
      style={{
        overflow: "auto",
        maxHeight: maxH,
        border: `1px solid ${IC.border}`,
        borderRadius: 8,
      }}
    >
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
        <thead style={{ position: "sticky", top: 0, background: IC.panel, zIndex: 1 }}>
          <tr>
            {cols.map((c) => {
              const active = sortKey === c.key;
              const clickable = c.sortable !== false;
              return (
                <th
                  key={c.key}
                  onClick={clickable ? () => onHeader(c.key, c.sortable) : undefined}
                  style={{
                    padding: "7px 8px",
                    textAlign: c.right ? "right" : "left",
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: 0.7,
                    color: active ? IC.text : IC.muted,
                    cursor: clickable ? "pointer" : "default",
                    whiteSpace: "nowrap",
                    borderBottom: `1px solid ${IC.border}`,
                    userSelect: "none",
                    fontWeight: 600,
                  }}
                >
                  {c.label}
                  {active ? (dir === "asc" ? " ▲" : " ▼") : ""}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const active = isRowActive?.(row) ?? false;
            return (
              <tr
                key={rowKey?.(row, i) ?? `${(row as { stk?: string }).stk ?? "r"}-${i}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                style={{
                  background: active ? IC.border : i % 2 ? IC.rowAlt : "transparent",
                  cursor: onRowClick ? "pointer" : undefined,
                  boxShadow: active ? `inset 3px 0 0 ${IC.yellow}` : undefined,
                }}
              >
                {cols.map((c) => renderCell(c, row, false))}
              </tr>
            );
          })}
        </tbody>
        {footer ? (
          <tfoot style={{ position: "sticky", bottom: 0, background: IC.panel, zIndex: 1 }}>
            <tr>{cols.map((c) => renderCell(c, footer, true))}</tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
