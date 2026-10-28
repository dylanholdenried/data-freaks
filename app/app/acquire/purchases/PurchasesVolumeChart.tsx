"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@/lib/acquire/cost";
import type { MonthlyVolumeRow } from "@/lib/acquire/monthly-volume";
import { IC } from "@/lib/inventory-command/midmo";

/** Pending Sale pink for Sales unit bars. */
const SALES_PINK = "#F472B6";
/** Seller Unwind purple for Reported Gross bars. */
const REPORTED_GROSS_PURPLE = "#A78BFA";

const LEGEND_ORDER = [
  "Purchases",
  "Sales",
  "Total gross",
  "Reported Gross",
] as const;

function countLabel(value: unknown): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(n);
}

function compactMoney(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}k`;
  return formatMoney(n);
}

function grossLabel(value: unknown): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n === 0) return "";
  return compactMoney(n);
}

function unitsLabel(n: number): string {
  return `${n} unit${n === 1 ? "" : "s"}`;
}

function VolumeTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; value?: number; payload?: MonthlyVolumeRow }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div
      className="rounded-md border px-3 py-2 text-xs shadow-lg"
      style={{
        background: IC.panel,
        borderColor: IC.border,
        color: IC.text,
        minWidth: 160,
      }}
    >
      <p className="mb-1.5 font-semibold" style={{ color: IC.text }}>
        {label}
      </p>
      <div className="space-y-1">
        <p style={{ color: IC.blue }}>Purchases: {unitsLabel(row.purchaseCount)}</p>
        <p style={{ color: SALES_PINK }}>Sales: {unitsLabel(row.salesCount)}</p>
        <p style={{ color: IC.green }}>
          Total gross: {formatMoney(row.grossTotal)}
        </p>
        <p style={{ color: REPORTED_GROSS_PURPLE }}>
          Reported Gross: {formatMoney(row.reportedGrossTotal)}
        </p>
      </div>
    </div>
  );
}

export default function PurchasesVolumeChart({ data }: { data: MonthlyVolumeRow[] }) {
  const hasActivity = data.length > 0;

  return (
    <div style={{ width: "100%", height: 280 }}>
      {!hasActivity ? (
        <p className="flex h-full items-center justify-center text-sm" style={{ color: IC.muted }}>
          No purchases, sales, or gross in the last 12 months for the selected store(s).
        </p>
      ) : (
        <ResponsiveContainer>
          <BarChart
            data={data}
            margin={{ top: 18, right: 12, left: 4, bottom: 0 }}
            barGap={2}
            barCategoryGap="16%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke={IC.line} vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: IC.muted, fontSize: 11 }}
              axisLine={{ stroke: IC.border }}
              tickLine={false}
            />
            <YAxis
              yAxisId="units"
              allowDecimals={false}
              tick={{ fill: IC.muted, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <YAxis
              yAxisId="gross"
              orientation="right"
              tick={{ fill: IC.muted, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={48}
              tickFormatter={(v) => compactMoney(Number(v)) || "$0"}
            />
            <Tooltip
              cursor={{ fill: "rgba(122, 167, 255, 0.08)" }}
              content={<VolumeTooltip />}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, color: IC.muted, paddingTop: 4 }}
              content={({ payload }) => {
                const byValue = new Map(
                  (payload ?? []).map((entry) => [String(entry.value), entry])
                );
                const ordered = LEGEND_ORDER.map((name) => byValue.get(name)).filter(
                  (entry): entry is NonNullable<typeof payload>[number] => Boolean(entry)
                );
                return (
                  <ul
                    className="flex flex-wrap justify-center gap-x-4 gap-y-1"
                    style={{ paddingTop: 4, margin: 0, listStyle: "none" }}
                  >
                    {ordered.map((entry) => (
                      <li
                        key={String(entry.value)}
                        className="inline-flex items-center gap-1.5"
                      >
                        <span
                          aria-hidden
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 2,
                            background: entry.color,
                            display: "inline-block",
                          }}
                        />
                        <span style={{ color: IC.muted }}>{entry.value}</span>
                      </li>
                    ))}
                  </ul>
                );
              }}
            />
            <Bar
              yAxisId="units"
              dataKey="purchaseCount"
              name="Purchases"
              fill={IC.blue}
              radius={[3, 3, 0, 0]}
              maxBarSize={24}
            >
              <LabelList
                dataKey="purchaseCount"
                position="top"
                formatter={countLabel}
                style={{ fill: IC.muted, fontSize: 9 }}
              />
            </Bar>
            <Bar
              yAxisId="units"
              dataKey="salesCount"
              name="Sales"
              fill={SALES_PINK}
              radius={[3, 3, 0, 0]}
              maxBarSize={24}
            >
              <LabelList
                dataKey="salesCount"
                position="top"
                formatter={countLabel}
                style={{ fill: IC.muted, fontSize: 9 }}
              />
            </Bar>
            <Bar
              yAxisId="gross"
              dataKey="grossTotal"
              name="Total gross"
              fill={IC.green}
              radius={[3, 3, 0, 0]}
              maxBarSize={24}
            >
              <LabelList
                dataKey="grossTotal"
                position="top"
                formatter={grossLabel}
                style={{ fill: IC.muted, fontSize: 9 }}
              />
            </Bar>
            <Bar
              yAxisId="gross"
              dataKey="reportedGrossTotal"
              name="Reported Gross"
              fill={REPORTED_GROSS_PURPLE}
              radius={[3, 3, 0, 0]}
              maxBarSize={24}
            >
              <LabelList
                dataKey="reportedGrossTotal"
                position="top"
                formatter={grossLabel}
                style={{ fill: IC.muted, fontSize: 9 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
