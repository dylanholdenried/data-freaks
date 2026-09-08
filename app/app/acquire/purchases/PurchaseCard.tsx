"use client";

import { IC } from "@/lib/inventory-command/midmo";
import { displayYmm } from "@/lib/acquire/incoming";
import { formatMoney, headerAgeDays } from "@/lib/acquire/cost";
import {
  ACQ_EXIT_STRATEGY_LABELS,
  ACQ_SOURCE_COLORS,
  ACQ_STAGE_LABELS,
  isCompletedStage,
  type AcqExitStrategy,
  type AcqPurchase,
  type AcqPurchaseStage,
} from "@/lib/acquire/types";
import { cn } from "@/lib/utils";
import { updateAcquirePurchaseStage } from "../actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/** Visual front of a purchase trading card (shared by grid + flip overlay). */
export function PurchaseCardFace({
  purchase,
  storeName,
  canEdit,
  interactive = true,
  className,
}: {
  purchase: AcqPurchase;
  storeName: string;
  canEdit: boolean;
  /** When false, stage dropdown is display-only (used on flying overlay front). */
  interactive?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [stageError, setStageError] = useState<string | null>(null);
  const colors =
    ACQ_SOURCE_COLORS[purchase.source_type] ?? ACQ_SOURCE_COLORS.auction;
  const age = headerAgeDays(purchase);
  const ageLabel = isCompletedStage(purchase.stage) ? "Sold age" : "Age";
  const makeInitial = (purchase.vehicle_make ?? "?").trim().charAt(0).toUpperCase() || "?";
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
      else router.refresh();
    });
  }

  return (
    <div
      className={cn("relative flex h-full w-full flex-col overflow-hidden rounded-xl border", className)}
      style={{
        background: `linear-gradient(165deg, ${colors.glow} 0%, ${IC.panel} 48%, #0d1117 100%)`,
        borderColor: IC.border,
        color: IC.text,
        boxShadow: `0 0 0 1px ${colors.stripe}22`,
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-1.5"
        style={{ background: colors.stripe }}
        aria-hidden
      />

      <div className="flex flex-1 flex-col px-3 pb-3 pt-5">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg font-bold"
            style={{
              background: colors.badge,
              color: IC.text,
              fontFamily: "var(--ic-font-display), Barlow Condensed, sans-serif",
            }}
            aria-hidden
          >
            {makeInitial}
          </div>
          <p
            className="text-right text-[10px] uppercase tracking-wide"
            style={{ color: IC.muted }}
          >
            {storeName}
          </p>
        </div>

        <p
          className="text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{ color: colors.stripe }}
        >
          {purchase.stock_number?.trim() || "No stock #"}
        </p>
        <p
          className="mt-1 text-4xl font-bold leading-none tracking-tight"
          style={{
            fontFamily: "var(--ic-font-display), Barlow Condensed, sans-serif",
            color: IC.text,
          }}
        >
          {purchase.vehicle_year ?? "—"}
        </p>
        <p className="mt-2 line-clamp-2 text-sm font-semibold leading-snug">
          {displayYmm({
            vehicle_year: null,
            vehicle_make: purchase.vehicle_make,
            vehicle_model: purchase.vehicle_model,
          })}
        </p>

        <div className="mt-auto space-y-2 pt-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: IC.muted }}>
            <span>
              {ageLabel}{" "}
              <strong style={{ color: IC.text }}>
                {age != null ? `${age}d` : "—"}
              </strong>
            </span>
            <span aria-hidden>·</span>
            <span>
              Photos{" "}
              <strong style={{ color: IC.text }}>
                {purchase.live_photo_count != null ? purchase.live_photo_count : "—"}
              </strong>
            </span>
          </div>

          <div onClick={(e) => e.stopPropagation()}>
            {canEdit && interactive ? (
              <select
                value={purchase.stage}
                disabled={pending}
                onChange={onStageChange}
                className="w-full rounded-md border px-2 py-1.5 text-[11px] font-medium"
                style={{
                  background: IC.rowAlt,
                  borderColor: IC.border,
                  color: IC.text,
                }}
                aria-label="Purchase stage"
              >
                {(Object.keys(ACQ_STAGE_LABELS) as AcqPurchaseStage[]).map((s) => (
                  <option key={s} value={s}>
                    {ACQ_STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
            ) : (
              <span
                className="inline-flex rounded-md px-2 py-1 text-[11px] font-semibold"
                style={{ background: colors.badge, color: IC.text }}
              >
                {stageLabel}
              </span>
            )}
            {stageError ? (
              <p className="mt-1 text-[10px]" style={{ color: IC.red }}>
                {stageError}
              </p>
            ) : null}
          </div>

          <p className="text-[11px]" style={{ color: IC.muted }}>
            {formatMoney(purchase.purchase_price)}
          </p>
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
}: {
  purchase: AcqPurchase;
  storeName: string;
  canEdit: boolean;
  /** Keep layout space but hide while the flying card is open. */
  hidden?: boolean;
  onOpen: (origin: CardOriginRect) => void;
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
        "group relative aspect-[3/4] cursor-pointer text-left transition",
        "hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        hidden && "invisible pointer-events-none"
      )}
    >
      <PurchaseCardFace purchase={purchase} storeName={storeName} canEdit={canEdit} />
    </article>
  );
}
