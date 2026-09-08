"use client";

import { IC, pomTone } from "@/lib/inventory-command/midmo";
import { displayYmm } from "@/lib/acquire/incoming";
import {
  adjPctOfMarket,
  formatMoney,
  formatMoneyExact,
  headerAgeDays,
  markup,
  merchCost,
  websitePrice,
} from "@/lib/acquire/cost";
import { missingAcquireActionItems } from "@/lib/acquire/action-items";
import {
  ACQ_EXIT_STRATEGY_LABELS,
  ACQ_STAGE_LABELS,
  ACQ_STAGES,
  isCompletedStage,
  purchaseCardColors,
  type AcqExitStrategy,
  type AcqPurchase,
  type AcqPurchaseStage,
} from "@/lib/acquire/types";
import { cn } from "@/lib/utils";
import { updateAcquirePurchaseStage } from "../actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

function MetricRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-2 text-xs leading-snug">
      <span className="shrink-0" style={{ color: IC.muted }}>
        {label}
      </span>
      <span
        className="min-w-0 truncate text-right font-semibold tabular-nums"
        style={{ color: tone ?? IC.text }}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

/** Visual front of a purchase trading card (shared by grid + flip overlay). */
export function PurchaseCardFace({
  purchase,
  storeName,
  canEdit,
  interactive = true,
  className,
  onPurchaseUpdated,
}: {
  purchase: AcqPurchase;
  storeName: string;
  canEdit: boolean;
  /** When false, stage dropdown is display-only (used on flying overlay front). */
  interactive?: boolean;
  className?: string;
  onPurchaseUpdated?: (updated: AcqPurchase) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [stageError, setStageError] = useState<string | null>(null);
  const colors = purchaseCardColors(purchase);
  const stock = purchase.stock_number?.trim() || "—";
  const ymm = displayYmm({
    vehicle_year: purchase.vehicle_year,
    vehicle_make: purchase.vehicle_make,
    vehicle_model: purchase.vehicle_model,
  });
  const vin = purchase.vin?.trim() || "—";
  const completed = isCompletedStage(purchase.stage);
  const vehicleAge = headerAgeDays(purchase);
  const daysInStep = purchase.days_in_step;
  const actionItemLabels = missingAcquireActionItems(purchase).map((i) => i.label);
  const actionItems = actionItemLabels.length;
  const cost = merchCost(purchase);
  const price = websitePrice(purchase);
  const mark = markup(purchase);
  const pom = adjPctOfMarket(purchase);
  const exitLabel =
    purchase.exit_strategy &&
    (ACQ_EXIT_STRATEGY_LABELS as Record<string, string>)[purchase.exit_strategy]
      ? ACQ_EXIT_STRATEGY_LABELS[purchase.exit_strategy as AcqExitStrategy]
      : null;
  const stageLabel =
    purchase.stage === "sold" && exitLabel
      ? `${ACQ_STAGE_LABELS.sold} · ${exitLabel}`
      : ACQ_STAGE_LABELS[purchase.stage];

  function onStageChange(e: React.ChangeEvent<HTMLSelectElement>) {
    e.stopPropagation();
    const stage = e.target.value as AcqPurchaseStage;
    if (!canEdit || !interactive || stage === purchase.stage) return;
    setStageError(null);
    startTransition(async () => {
      const res = await updateAcquirePurchaseStage(purchase.id, stage);
      if (!res.ok) setStageError(res.error);
      else if (res.purchase) {
        onPurchaseUpdated?.({
          ...purchase,
          ...res.purchase,
          days_in_step: 0,
        });
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div
      className={cn(
        "relative flex w-full flex-col overflow-hidden rounded-xl border",
        className
      )}
      style={{
        background: `linear-gradient(165deg, ${colors.glow} 0%, ${IC.panel} 48%, #0d1117 100%)`,
        borderColor: IC.border,
        color: IC.text,
        boxShadow: `0 0 0 1px ${colors.stripe}22`,
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: colors.stripe }}
        aria-hidden
      />

      <div className="flex w-full min-w-0 flex-col gap-1.5 px-2.5 pb-2.5 pt-3">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="flex min-w-0 max-w-[55%] flex-col items-start gap-1">
            <div
              className="flex min-h-9 max-w-full items-center justify-center break-all rounded-md px-1.5 py-1 text-center text-sm font-bold leading-tight tracking-wide"
              style={{
                background: colors.badge,
                color: IC.text,
                fontFamily: "var(--ic-font-display), Barlow Condensed, sans-serif",
              }}
              title={stock}
            >
              {stock}
            </div>
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.08em]"
              style={{ color: IC.muted }}
            >
              Age
            </p>
            <div
              className="inline-flex items-center justify-center rounded-md px-2 py-0.5"
              style={{ background: colors.badge, boxShadow: `inset 0 0 0 1px ${colors.stripe}55` }}
              title={
                completed
                  ? "Days from purchase to sold"
                  : "Days since purchase"
              }
            >
              <span
                className="text-base font-bold leading-none tabular-nums"
                style={{
                  fontFamily: "var(--ic-font-display), Barlow Condensed, sans-serif",
                  color: IC.text,
                }}
              >
                {vehicleAge != null ? `${vehicleAge}d` : "—"}
              </span>
            </div>
          </div>
          <div className="min-w-0 max-w-[45%] shrink-0 text-right">
            <p
              className="truncate text-[11px] uppercase tracking-wide"
              style={{ color: IC.muted }}
              title={storeName}
            >
              {storeName}
            </p>
            <p
              className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
              style={{ color: IC.muted }}
            >
              Days in step
            </p>
            <div
              className="mt-0.5 inline-flex items-center justify-center rounded-md px-2 py-0.5"
              style={{ background: colors.badge, boxShadow: `inset 0 0 0 1px ${colors.stripe}55` }}
            >
              <span
                className="text-base font-bold leading-none tabular-nums"
                style={{
                  fontFamily: "var(--ic-font-display), Barlow Condensed, sans-serif",
                  color: IC.text,
                }}
              >
                {daysInStep != null ? `${daysInStep}d` : "—"}
              </span>
            </div>
            <p
              className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em]"
              style={{ color: IC.muted }}
            >
              Action items
            </p>
            <div
              className="mt-0.5 inline-flex items-center justify-center rounded-md px-2 py-0.5"
              style={{
                background: actionItems > 0 ? `${IC.orange}33` : colors.badge,
                boxShadow: `inset 0 0 0 1px ${actionItems > 0 ? IC.orange : colors.stripe}55`,
              }}
              title={
                actionItems > 0
                  ? actionItemLabels.join(" · ")
                  : "All expected fields for this step are filled"
              }
            >
              <span
                className="text-base font-bold leading-none tabular-nums"
                style={{
                  fontFamily: "var(--ic-font-display), Barlow Condensed, sans-serif",
                  color: actionItems > 0 ? IC.orange : IC.text,
                }}
              >
                {actionItems}
              </span>
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <p className="break-words text-sm font-semibold leading-snug" title={ymm}>
            {ymm}
          </p>
          <p
            className="mt-0.5 truncate font-mono text-[11px] tracking-wide"
            style={{ color: IC.muted }}
            title={vin}
          >
            {vin}
          </p>
        </div>

        {purchase.on_hold ? (
          <span
            className="inline-flex w-fit rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ background: `${IC.orange}33`, color: IC.orange }}
          >
            On Hold
          </span>
        ) : null}

        <div
          className="min-w-0 space-y-1 rounded-md border px-2 py-1.5"
          style={{ borderColor: IC.border, background: "rgba(15,20,28,0.55)" }}
        >
          <MetricRow label="Cost" value={formatMoney(cost)} />
          <MetricRow label="Price" value={formatMoney(price)} />
          <MetricRow label="Markup" value={formatMoneyExact(mark)} />
          <MetricRow
            label="Adj % of Market"
            value={pom != null ? `${pom}%` : "—"}
            tone={pomTone(pom)}
          />
        </div>

        <div className="min-w-0 space-y-1" onClick={(e) => e.stopPropagation()}>
          {canEdit && interactive ? (
            <select
              value={purchase.stage}
              disabled={pending}
              onChange={onStageChange}
              className="w-full min-w-0 max-w-full rounded-md border px-1.5 py-1.5 text-center text-sm font-semibold"
              style={{
                background: IC.rowAlt,
                borderColor: IC.border,
                color: IC.text,
                textAlignLast: "center",
              }}
              aria-label="Purchase stage"
            >
              {ACQ_STAGES.map((s) => (
                <option key={s} value={s}>
                  {ACQ_STAGE_LABELS[s]}
                </option>
              ))}
            </select>
          ) : (
            <span
              className="flex w-full min-w-0 items-center justify-center truncate rounded-md px-1.5 py-1.5 text-center text-sm font-semibold"
              style={{ background: colors.badge, color: IC.text }}
              title={stageLabel}
            >
              {stageLabel}
            </span>
          )}
          {stageError ? (
            <p className="text-center text-[11px]" style={{ color: IC.red }}>
              {stageError}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export type CardOriginRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export default function PurchaseCard({
  purchase,
  storeName,
  canEdit,
  hidden,
  onOpen,
  onPurchaseUpdated,
}: {
  purchase: AcqPurchase;
  storeName: string;
  canEdit: boolean;
  /** Keep layout space but hide while the flying card is open. */
  hidden?: boolean;
  onOpen: (origin: CardOriginRect) => void;
  onPurchaseUpdated?: (updated: AcqPurchase) => void;
}) {
  return (
    <article
      role="button"
      tabIndex={hidden ? -1 : 0}
      aria-hidden={hidden || undefined}
      onClick={(e) => {
        if (hidden) return;
        const el = e.currentTarget;
        const r = el.getBoundingClientRect();
        onOpen({ top: r.top, left: r.left, width: r.width, height: r.height });
      }}
      onKeyDown={(e) => {
        if (hidden) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const el = e.currentTarget;
          const r = el.getBoundingClientRect();
          onOpen({ top: r.top, left: r.left, width: r.width, height: r.height });
        }
      }}
      className={cn(
        "group relative w-full min-w-0 cursor-pointer text-left transition",
        "hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        hidden && "invisible pointer-events-none"
      )}
    >
      <PurchaseCardFace
        purchase={purchase}
        storeName={storeName}
        canEdit={canEdit}
        onPurchaseUpdated={onPurchaseUpdated}
      />
    </article>
  );
}
