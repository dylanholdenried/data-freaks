"use client";

import { spread, type TaggedUnit } from "@/lib/inventory-command/acq-source";
import { fmtMoney, fmtNum, fmtPct } from "@/lib/inventory-command/format";
import { ageTone, IC, photoTone, pomTone } from "@/lib/inventory-command/midmo";
import { IcTable, type IcCol } from "./IcTable";
import { ctmTone, spreadTone } from "./SourceHealthTable";

export type UnitColumnDef = {
  key: string;
  label: string;
  defaultOn: boolean;
  right?: boolean;
  /** Value for sorting and CSV export. */
  value: (u: TaggedUnit) => string | number | null;
  render?: (u: TaggedUnit) => React.ReactNode;
  color?: (u: TaggedUnit) => string | undefined;
  bold?: boolean;
};

const REVERT = "__revert";

function dispLabel(d: TaggedUnit["disp"]): string {
  if (d === "subprime") return "Subprime";
  if (d === "wholesale") return "Wholesale";
  return "Retail";
}

/** Data columns shared by the table, column picker, and CSV export (source handled separately). */
export const UNIT_COLUMNS: UnitColumnDef[] = [
  { key: "stk", label: "Stock #", defaultOn: true, bold: true, value: (u) => u.stk },
  { key: "year", label: "Year", defaultOn: true, value: (u) => u.year },
  { key: "make", label: "Make", defaultOn: true, value: (u) => u.make },
  { key: "model", label: "Model", defaultOn: true, value: (u) => u.model },
  { key: "trim", label: "Trim", defaultOn: true, value: (u) => u.trim },
  { key: "veh", label: "Vehicle (full)", defaultOn: false, value: (u) => u.veh },
  { key: "body", label: "Body", defaultOn: false, value: (u) => u.body },
  {
    key: "vin",
    label: "VIN",
    defaultOn: false,
    value: (u) => u.vin,
    render: (u) => (u.vin ? `…${u.vin.slice(-8)}` : "—"),
  },
  {
    key: "odometer",
    label: "Miles",
    defaultOn: true,
    right: true,
    value: (u) => u.odometer,
    render: (u) => fmtNum(u.odometer),
  },
  {
    key: "age",
    label: "Age",
    defaultOn: true,
    right: true,
    value: (u) => u.age,
    color: (u) => ageTone(u.age),
    render: (u) => u.age ?? "—",
  },
  {
    key: "cost",
    label: "Cost",
    defaultOn: true,
    right: true,
    value: (u) => u.cost,
    render: (u) => fmtMoney(u.cost),
  },
  {
    key: "price",
    label: "Price",
    defaultOn: true,
    right: true,
    bold: true,
    value: (u) => u.price,
    render: (u) => fmtMoney(u.price),
  },
  {
    key: "markup",
    label: "Markup",
    defaultOn: true,
    right: true,
    value: (u) => u.markup ?? (u.price != null && u.cost != null ? u.price - u.cost : null),
    color: (u) => spreadTone(u.markup ?? (u.price != null && u.cost != null ? u.price - u.cost : null)),
    render: (u) => fmtMoney(u.markup ?? (u.price != null && u.cost != null ? u.price - u.cost : null)),
  },
  {
    key: "pom",
    label: "Adj % Mkt",
    defaultOn: true,
    right: true,
    value: (u) => u.pom,
    color: (u) => pomTone(u.pom),
    render: (u) => fmtPct(u.pom, 1),
  },
  {
    key: "ctm_pct",
    label: "Adj Cost to Mkt",
    defaultOn: true,
    right: true,
    value: (u) => u.ctm_pct,
    color: (u) => ctmTone(u.ctm_pct),
    render: (u) => fmtPct(u.ctm_pct, 1),
  },
  {
    key: "market_price",
    label: "Market $",
    defaultOn: false,
    right: true,
    value: (u) => u.market_price,
    render: (u) => fmtMoney(u.market_price),
  },
  {
    key: "mmr",
    label: "MMR",
    defaultOn: true,
    right: true,
    value: (u) => u.mmr,
    render: (u) => fmtMoney(u.mmr),
  },
  {
    key: "mmrSpread",
    label: "MMR − Cost",
    defaultOn: true,
    right: true,
    value: (u) => spread(u.mmr, u.cost),
    color: (u) => spreadTone(spread(u.mmr, u.cost)),
    render: (u) => fmtMoney(spread(u.mmr, u.cost)),
  },
  {
    key: "jd",
    label: "JD Trade",
    defaultOn: true,
    right: true,
    value: (u) => u.jd,
    render: (u) => fmtMoney(u.jd),
  },
  {
    key: "jdSpread",
    label: "JD − Cost",
    defaultOn: false,
    right: true,
    value: (u) => spread(u.jd, u.cost),
    color: (u) => spreadTone(spread(u.jd, u.cost)),
    render: (u) => fmtMoney(spread(u.jd, u.cost)),
  },
  {
    key: "bb_retail",
    label: "BB Retail",
    defaultOn: true,
    right: true,
    value: (u) => u.bb_retail,
    render: (u) => fmtMoney(u.bb_retail),
  },
  {
    key: "bbSpread",
    label: "BB − Cost",
    defaultOn: false,
    right: true,
    value: (u) => spread(u.bb_retail, u.cost),
    color: (u) => spreadTone(spread(u.bb_retail, u.cost)),
    render: (u) => fmtMoney(spread(u.bb_retail, u.cost)),
  },
  {
    key: "ph",
    label: "Photos",
    defaultOn: true,
    right: true,
    value: (u) => u.ph,
    color: (u) => photoTone(u.ph),
    render: (u) => u.ph ?? 0,
  },
  {
    key: "srp",
    label: "SRP",
    defaultOn: true,
    right: true,
    value: (u) => u.srp,
    render: (u) => fmtNum(u.srp),
  },
  {
    key: "vdp",
    label: "VDP",
    defaultOn: true,
    right: true,
    value: (u) => u.vdp,
    render: (u) => fmtNum(u.vdp),
  },
  {
    key: "vr",
    label: "VDP %",
    defaultOn: false,
    right: true,
    value: (u) => u.vr,
    render: (u) => (u.vr == null ? "—" : `${u.vr}%`),
  },
  {
    key: "site_srp",
    label: "Site SRP",
    defaultOn: false,
    right: true,
    value: (u) => u.site_srp,
    render: (u) => fmtNum(u.site_srp),
  },
  {
    key: "site_vdp",
    label: "Site VDP",
    defaultOn: false,
    right: true,
    value: (u) => u.site_vdp,
    render: (u) => fmtNum(u.site_vdp),
  },
  {
    key: "dsr",
    label: "Days since $",
    defaultOn: true,
    right: true,
    value: (u) => u.dsr,
    color: (u) => ((u.dsr ?? 0) >= 7 ? IC.red : IC.text),
    render: (u) => u.dsr ?? "—",
  },
  {
    key: "d_p",
    label: "Δ Price",
    defaultOn: false,
    right: true,
    value: (u) => u.d_p,
    color: (u) => (u.d_p == null || u.d_p === 0 ? undefined : u.d_p < 0 ? IC.green : IC.orange),
    render: (u) => (u.d_p == null || u.d_p === 0 ? "—" : fmtMoney(u.d_p)),
  },
  { key: "disp", label: "Disposition", defaultOn: true, value: (u) => dispLabel(u.disp) },
  { key: "pt", label: "ProfitTime", defaultOn: false, value: (u) => u.pt },
  { key: "pt_align", label: "PT Alignment", defaultOn: false, value: (u) => u.pt_align },
];

function OriginBadge({ origin }: { origin: TaggedUnit["sourceOrigin"] }) {
  if (!origin) return null;
  const manual = origin === "manual";
  return (
    <span
      title={manual ? "Set manually — kept until changed" : "From the stock # rule"}
      style={{
        marginLeft: 6,
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: 0.6,
        padding: "1px 5px",
        borderRadius: 4,
        border: `1px solid ${manual ? IC.blue : IC.border}`,
        color: manual ? IC.blue : IC.muted,
      }}
    >
      {manual ? "MANUAL" : "AUTO"}
    </span>
  );
}

export default function InventoryUnitTable({
  units,
  sourceNames,
  canTag,
  visibleCols,
  selected,
  savingStks,
  onToggleSelect,
  onToggleSelectAll,
  onSetSource,
  onOpenUnit,
}: {
  units: TaggedUnit[];
  sourceNames: string[];
  canTag: boolean;
  visibleCols: Set<string>;
  selected: Set<string>;
  savingStks: Set<string>;
  onToggleSelect: (stk: string) => void;
  onToggleSelectAll: (on: boolean) => void;
  onSetSource: (stks: string[], source: string | null) => void;
  onOpenUnit: (u: TaggedUnit) => void;
}) {
  const allSelected = units.length > 0 && units.every((u) => selected.has(u.stk));

  const sourceCol: IcCol<TaggedUnit> = {
    key: "source",
    label: "Source",
    sortValue: (u) => u.source ?? "",
    render: (u) => {
      const saving = savingStks.has(u.stk);
      if (!canTag) {
        return (
          <span title={u.sourceNote ?? undefined} style={{ color: u.source ? IC.text : IC.orange }}>
            {u.source ?? "Needs tag"}
            <OriginBadge origin={u.sourceOrigin} />
          </span>
        );
      }
      const options =
        u.source && !sourceNames.includes(u.source) ? [...sourceNames, u.source] : sourceNames;
      return (
        <span
          onClick={(e) => e.stopPropagation()}
          style={{ display: "inline-flex", alignItems: "center" }}
        >
          <select
            value={u.source ?? ""}
            disabled={saving}
            title={u.sourceNote ?? undefined}
            onChange={(e) => {
              const v = e.target.value;
              if (v === REVERT) onSetSource([u.stk], null);
              else if (v) onSetSource([u.stk], v);
            }}
            style={{
              background: IC.bg,
              color: u.source ? IC.text : IC.orange,
              border: `1px solid ${u.source ? IC.border : IC.orange}`,
              borderRadius: 6,
              padding: "3px 6px",
              fontSize: 12,
              maxWidth: 190,
            }}
          >
            {!u.source ? <option value="">Needs tag</option> : null}
            {options.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            {u.sourceOrigin === "manual" ? (
              <option value={REVERT}>↺ Revert to stock # rule</option>
            ) : null}
          </select>
          {saving ? (
            <span style={{ marginLeft: 6, fontSize: 11, color: IC.muted }}>saving…</span>
          ) : (
            <OriginBadge origin={u.sourceOrigin} />
          )}
        </span>
      );
    },
  };

  const selectCol: IcCol<TaggedUnit> = {
    key: "__select",
    label: "",
    sortable: false,
    render: (u) => (
      <input
        type="checkbox"
        checked={selected.has(u.stk)}
        onClick={(e) => e.stopPropagation()}
        onChange={() => onToggleSelect(u.stk)}
        aria-label={`Select ${u.stk}`}
      />
    ),
  };

  const dataCols: IcCol<TaggedUnit>[] = UNIT_COLUMNS.filter((c) => visibleCols.has(c.key)).map(
    (c) => ({
      key: c.key,
      label: c.label,
      right: c.right,
      bold: c.bold,
      color: c.color,
      render: c.render ?? ((u: TaggedUnit) => c.value(u) ?? "—"),
      sortValue: c.value,
    })
  );

  const [stkCol, ...restCols] = dataCols;
  const cols: IcCol<TaggedUnit>[] = [
    ...(canTag ? [selectCol] : []),
    ...(stkCol?.key === "stk" ? [stkCol, sourceCol, ...restCols] : [sourceCol, ...dataCols]),
  ];

  return (
    <div>
      {canTag && units.length > 0 ? (
        <label
          className="mb-2 inline-flex items-center gap-2 text-xs"
          style={{ color: IC.muted, cursor: "pointer" }}
        >
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => onToggleSelectAll(e.target.checked)}
          />
          Select all {fmtNum(units.length)} shown
        </label>
      ) : null}
      <IcTable
        cols={cols}
        rows={units}
        defaultSort="age"
        defaultDir="desc"
        maxH={640}
        rowKey={(u) => u.stk}
        onRowClick={onOpenUnit}
        isRowActive={(u) => selected.has(u.stk)}
      />
    </div>
  );
}
