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

/** Dark green for total gross profit bars. */
const GROSS_GREEN = "#0D5C38";

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
        <p style={{ color: IC.green }}>Sales: {unitsLabel(row.salesCount)}</p>
        <p style={{ color: GROSS_GREEN }}>
          Total gross: {formatMoney(row.grossTotal)}
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
              formatter={(value) => (
                <span style={{ color: IC.muted }}>{value}</span>
              )}
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
              fill={IC.green}
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
              fill={GROSS_GREEN}
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
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
