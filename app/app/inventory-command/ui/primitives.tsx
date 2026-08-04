"use client";

import { Inter, Barlow_Condensed } from "next/font/google";
import { cn } from "@/lib/utils";
import { IC } from "@/lib/inventory-command/midmo";

export const icSans = Inter({
  subsets: ["latin"],
  variable: "--ic-font-sans",
  display: "swap",
});

export const icDisplay = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--ic-font-display",
  display: "swap",
});

export function IcRoot({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        icSans.variable,
        icDisplay.variable,
        "ic-root -mx-5 -my-6 min-h-[calc(100vh-3.5rem)] px-5 py-6 lg:-mx-8 lg:px-8",
        className
      )}
      style={{
        background: IC.bg,
        color: IC.text,
        fontFamily: "var(--ic-font-sans), Inter, system-ui, sans-serif",
        fontSize: 14,
      }}
    >
      {children}
    </div>
  );
}

export function IcPanel({
  title,
  note,
  children,
  className,
}: {
  title?: string;
  note?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("mb-4", className)}
      style={{
        background: IC.panel,
        border: `1px solid ${IC.border}`,
        borderRadius: 10,
        padding: 16,
      }}
    >
      {(title || note) && (
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          {title ? (
            <h2 className="text-[13px] font-bold uppercase tracking-wide" style={{ color: IC.text }}>
              {title}
            </h2>
          ) : (
            <span />
          )}
          {note ? (
            <p className="text-xs" style={{ color: IC.muted }}>
              {note}
            </p>
          ) : null}
        </div>
      )}
      {children}
    </section>
  );
}

export function IcKpi({
  label,
  value,
  sub,
  status = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  status?: "ok" | "warn" | "bad" | "neutral";
}) {
  const color =
    status === "ok"
      ? IC.green
      : status === "warn"
        ? IC.yellow
        : status === "bad"
          ? IC.red
          : IC.text;

  return (
    <div
      style={{
        background: IC.panel,
        border: `1px solid ${IC.border}`,
        borderRadius: 10,
        padding: "12px 16px",
        flex: 1,
        minWidth: 130,
      }}
    >
      <div
        style={{
          color: IC.muted,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--ic-font-display), 'Barlow Condensed', sans-serif",
          fontSize: 34,
          fontWeight: 700,
          lineHeight: 1.15,
          color,
        }}
      >
        {value}
      </div>
      {sub ? (
        <div style={{ color: IC.muted, fontSize: 12, marginTop: 2 }}>{sub}</div>
      ) : null}
    </div>
  );
}

export function IcAttention({
  color,
  title,
  body,
}: {
  color: string;
  title: string;
  body: string;
}) {
  return (
    <div
      style={{
        borderLeft: `3px solid ${color}`,
        background: IC.panel,
        border: `1px solid ${IC.border}`,
        borderLeftWidth: 3,
        borderLeftColor: color,
        borderRadius: 8,
        padding: "12px 14px",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: IC.text }}>{title}</div>
      <div style={{ color: IC.muted, fontSize: 13, lineHeight: 1.45 }}>{body}</div>
    </div>
  );
}

export function IcFooterNote({
  threshold,
  daysToFirst,
}: {
  threshold: number | null;
  daysToFirst: number | null;
}) {
  return (
    <p
      className="mt-6 text-center text-[11px] leading-relaxed"
      style={{ color: IC.muted }}
    >
      {threshold != null && daysToFirst != null
        ? `Hot list threshold auto-set to age ≥ ${threshold} (${daysToFirst} days to the 1st). `
        : null}
      SRP/VDP = AutoTrader + Cars.com combined. MMR water = MMR wholesale minus unit cost.
    </p>
  );
}

export function IcEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="px-4 py-10 text-center text-sm"
      style={{
        color: IC.muted,
        border: `1px dashed ${IC.border}`,
        borderRadius: 10,
        background: IC.panel,
      }}
    >
      {children}
    </div>
  );
}
