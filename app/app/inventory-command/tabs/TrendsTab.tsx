"use client";

import type { ReactNode } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { InvDailyMetrics } from "@/lib/inventory-command/types";

export default function TrendsTab({ history }: { history: InvDailyMetrics[] }) {
  const data = [...history].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));

  if (data.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-muted px-4 py-8 text-center text-sm text-muted-foreground">
        No daily metrics history yet.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <ChartCard title="Units in stock">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="snapshot_date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Line type="monotone" dataKey="units" stroke="#2563eb" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Age & aged inventory">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="snapshot_date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="avg_age"
              name="Avg age"
              stroke="#0f766e"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="over60"
              name="Over 60"
              stroke="#d97706"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="over90"
              name="Over 90"
              stroke="#dc2626"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Merchandising & pricing health">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="snapshot_date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="stale" name="Stale" stroke="#dc2626" strokeWidth={2} dot={false} />
            <Line
              type="monotone"
              dataKey="no_price"
              name="No price"
              stroke="#7c3aed"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="no_ph"
              name="No photos"
              stroke="#64748b"
              strokeWidth={2}
              dot={false}
            />
            <Line type="monotone" dataKey="hot" name="Hot" stroke="#ea580c" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}
