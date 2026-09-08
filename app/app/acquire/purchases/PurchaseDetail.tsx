"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IC } from "@/lib/inventory-command/midmo";
import {
  ACQ_EXIT_STRATEGIES,
  ACQ_EXIT_STRATEGY_LABELS,
  ACQ_SOURCE_LABELS,
  ACQ_SOURCE_TYPES,
  ACQ_STAGE_LABELS,
  ACQ_STAGES,
  isCompletedStage,
  type AcqBuyer,
  type AcqExitStrategy,
  type AcqPurchase,
} from "@/lib/acquire/types";
import {
  currentJd,
  currentMmr,
  daysBetween,
  daysSince,
  formatDelta,
  formatMoney,
  formatMoneyExact,
  headerAgeDays,
  markup,
  merchCost,
  num,
  websitePrice,
} from "@/lib/acquire/cost";
import { updateAcquirePurchase } from "../actions";
import { decodeVin, VinDecodeError } from "@/lib/vehicle";
import { Loader2, X } from "lucide-react";
import AcquireVehicleFields, {
  normalizeDrivetrain,
  type VehicleCatalogMake,
  type VehicleCatalogModel,
} from "./AcquireVehicleFields";

const TABS = [
  "Overview",
  "Acquisition",
  "Books",
  "Recon",
  "Merchandising",
  "Exit",
] as const;

type Tab = (typeof TABS)[number];

function Field({
  label,
  name,
  defaultValue,
  value,
  onChange,
  type = "text",
  readOnly,
  step,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  value?: string;
  onChange?: (v: string) => void;
  type?: string;
  readOnly?: boolean;
  step?: string;
}) {
  const controlled = value !== undefined;
  return (
    <label className="block text-xs">
      <span style={{ color: IC.muted }}>{label}</span>
      <input
        name={name}
        type={type}
        step={step}
        readOnly={readOnly}
        {...(controlled
          ? { value, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value) }
          : { defaultValue: defaultValue ?? "" })}
        className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
        style={{
          background: readOnly ? IC.rowAlt : "#0f141c",
          borderColor: IC.border,
          color: IC.text,
          opacity: readOnly ? 0.85 : 1,
        }}
      />
    </label>
  );
}

function ReadRow({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div
      className="flex items-baseline justify-between gap-3 border-b py-2 text-sm"
      style={{ borderColor: IC.line }}
    >
      <span style={{ color: IC.muted }}>{label}</span>
      <span className="font-medium tabular-nums" style={tone ? { color: tone } : undefined}>
        {value}
      </span>
    </div>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  disabled,
  options,
}: {
  label: string;
  name: string;
  defaultValue: string;
  disabled?: boolean;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block text-xs">
      <span style={{ color: IC.muted }}>{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
        style={{ background: "#0f141c", borderColor: IC.border, color: IC.text }}
      >
        {options.map((o) => (
          <option key={o.value || "__empty"} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function CheckField({
  label,
  name,
  defaultChecked,
  disabled,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm" style={{ color: IC.text }}>
      <input
        type="checkbox"
        name={name}
        value="true"
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="h-4 w-4 rounded border"
      />
      {label}
    </label>
  );
}

export default function PurchaseDetail({
  purchase,
  storeName,
  buyers,
  vehicleMakes,
  vehicleModels,
  canEdit,
  onClose,
}: {
  purchase: AcqPurchase;
  storeName: string;
  buyers: AcqBuyer[];
  vehicleMakes: VehicleCatalogMake[];
  vehicleModels: VehicleCatalogModel[];
  canEdit: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Overview");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [decoding, setDecoding] = useState(false);
  const [vin, setVin] = useState(purchase.vin ?? "");
  const [year, setYear] = useState(purchase.vehicle_year != null ? String(purchase.vehicle_year) : "");
  const [make, setMake] = useState(purchase.vehicle_make ?? "");
  const [model, setModel] = useState(purchase.vehicle_model ?? "");
  const [trim, setTrim] = useState(purchase.vehicle_trim ?? "");
  const [color, setColor] = useState(purchase.color ?? "");
  const [bodyStyle, setBodyStyle] = useState(purchase.body_style ?? "");
  const [drivetrain, setDrivetrain] = useState(purchase.drivetrain ?? "");
  const [hasTrade, setHasTrade] = useState(Boolean(purchase.has_trade));
  const [stage, setStage] = useState(purchase.stage);
  const [exitStrategy, setExitStrategy] = useState(purchase.exit_strategy ?? "");
  const [tradeVin, setTradeVin] = useState(purchase.trade_vin ?? "");
  const [tradeYear, setTradeYear] = useState(purchase.trade_year != null ? String(purchase.trade_year) : "");
  const [tradeMake, setTradeMake] = useState(purchase.trade_make ?? "");
  const [tradeModel, setTradeModel] = useState(purchase.trade_model ?? "");

  const age = headerAgeDays(purchase);
  const soldAge = daysBetween(purchase.purchase_date, purchase.sold_date);
  const currentAge = daysSince(purchase.purchase_date);
  const mmrNow = currentMmr(purchase);
  const jdNow = currentJd(purchase);
  const mmrDelta =
    mmrNow != null && purchase.purchase_mmr != null ? mmrNow - num(purchase.purchase_mmr) : null;
  const jdDelta =
    jdNow != null && purchase.purchase_jd != null ? jdNow - num(purchase.purchase_jd) : null;
  const reconMiss =
    purchase.recon_cost != null && purchase.recon_estimate != null
      ? num(purchase.recon_cost) - num(purchase.recon_estimate)
      : null;
  const daysInRecon = daysBetween(purchase.delivery_date, purchase.frontline_date);
  const timeToLine = daysBetween(purchase.purchase_date, purchase.frontline_date);
  const transportDays = daysBetween(purchase.purchase_date, purchase.delivery_date);
  const saleOverMmr =
    purchase.sold_price != null && mmrNow != null ? num(purchase.sold_price) - mmrNow : null;
  const saleOverJd =
    purchase.sold_price != null && jdNow != null ? num(purchase.sold_price) - jdNow : null;
  const totalProfit =
    purchase.total_gross != null
      ? num(purchase.total_gross)
      : purchase.front_gross != null || purchase.back_gross != null
        ? num(purchase.front_gross) + num(purchase.back_gross)
        : null;

  const activeBuyers = useMemo(() => buyers.filter((b) => b.active || b.id === purchase.buyer_id), [buyers, purchase.buyer_id]);

  async function handleDecode(target: "vehicle" | "trade") {
    const raw = (target === "vehicle" ? vin : tradeVin).trim().toUpperCase();
    if (raw.length !== 17) {
      setError("VIN must be 17 characters to decode.");
      return;
    }
    setDecoding(true);
    setError(null);
    try {
      const d = await decodeVin(raw);
      if (target === "vehicle") {
        if (d.year != null) setYear(String(d.year));
        if (d.make) setMake(d.make);
        if (d.model) setModel(d.model);
        if (d.trim) setTrim(d.trim);
        if (d.bodyStyle) setBodyStyle(d.bodyStyle);
        if (d.drivetrain) setDrivetrain(normalizeDrivetrain(d.drivetrain));
      } else {
        if (d.year != null) setTradeYear(String(d.year));
        if (d.make) setTradeMake(d.make);
        if (d.model) setTradeModel(d.model);
      }
    } catch (e) {
      setError(e instanceof VinDecodeError ? e.message : "VIN decode failed");
    } finally {
      setDecoding(false);
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canEdit) return;
    const fd = new FormData(e.currentTarget);
    fd.set("vin", vin.trim().toUpperCase());
    fd.set("vehicle_year", year);
    fd.set("vehicle_make", make);
    fd.set("vehicle_model", model);
    fd.set("vehicle_trim", trim);
    fd.set("color", color);
    fd.set("body_style", bodyStyle);
    fd.set("drivetrain", drivetrain);
    fd.set("has_trade", hasTrade ? "true" : "false");
    fd.set("exit_strategy", exitStrategy);
    if (hasTrade) {
      fd.set("trade_vin", tradeVin.trim().toUpperCase());
      fd.set("trade_year", tradeYear);
      fd.set("trade_make", tradeMake);
      fd.set("trade_model", tradeModel);
    }
    setError(null);
    startTransition(async () => {
      const res = await updateAcquirePurchase(purchase.id, fd);
      if (!res.ok) setError(res.error);
      else {
        router.refresh();
        onClose();
      }
    });
  }

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border shadow-2xl"
      style={{ background: IC.bg, borderColor: IC.border, color: IC.text }}
    >
      <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
        <header
          className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3"
          style={{ borderColor: IC.border }}
        >
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: IC.muted }}>
              {storeName}
            </p>
            <h2
              className="mt-1 truncate text-2xl font-bold leading-tight"
              style={{ fontFamily: "var(--ic-font-display), Barlow Condensed, sans-serif" }}
            >
              {purchase.stock_number || "—"} · {year || purchase.vehicle_year || "—"} {make || purchase.vehicle_make || ""}{" "}
              {model || purchase.vehicle_model || ""}
            </h2>
            <p className="mt-1 text-xs" style={{ color: IC.muted }}>
              {isCompletedStage(stage) ? "Sold age" : "Age"} {age != null ? `${age}d` : "—"}
            </p>
          </div>
          <div className="flex shrink-0 items-start gap-2">
            <label className="block text-right text-[10px] font-semibold uppercase tracking-wide">
              <span style={{ color: IC.muted }}>Status</span>
              <select
                name="stage"
                value={stage}
                disabled={!canEdit}
                onChange={(e) => setStage(e.target.value as typeof stage)}
                className="mt-1 block min-w-[10.5rem] rounded-md border px-2 py-1.5 text-left text-sm font-medium normal-case tracking-normal"
                style={{ background: "#0f141c", borderColor: IC.border, color: IC.text }}
              >
                {ACQ_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {ACQ_STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={onClose} className="rounded-md p-1.5 hover:bg-white/5" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex shrink-0 gap-1 overflow-x-auto border-b px-2 py-2" style={{ borderColor: IC.border }}>
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="shrink-0 rounded-md px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide"
              style={{
                background: tab === t ? IC.panel : "transparent",
                color: tab === t ? IC.text : IC.muted,
                border: tab === t ? `1px solid ${IC.border}` : "1px solid transparent",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div className={tab === "Overview" ? "space-y-3" : "hidden"}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Stock #" name="stock_number" defaultValue={purchase.stock_number} readOnly={!canEdit} />
              <label className="block text-xs">
                <span style={{ color: IC.muted }}>VIN</span>
                <div className="mt-1 flex gap-1">
                  <input
                    name="vin"
                    value={vin}
                    onChange={(e) => setVin(e.target.value.toUpperCase())}
                    readOnly={!canEdit}
                    maxLength={17}
                    className="w-full rounded-md border px-2 py-1.5 text-sm uppercase"
                    style={{ background: canEdit ? "#0f141c" : IC.rowAlt, borderColor: IC.border, color: IC.text }}
                  />
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => void handleDecode("vehicle")}
                      disabled={decoding}
                      className="shrink-0 rounded-md border px-2 text-[10px] font-semibold"
                      style={{ borderColor: IC.border, color: IC.blue }}
                    >
                      {decoding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Decode"}
                    </button>
                  ) : null}
                </div>
              </label>
            </div>
            <AcquireVehicleFields
              vehicleMakes={vehicleMakes}
              vehicleModels={vehicleModels}
              canEdit={canEdit}
              year={year}
              make={make}
              model={model}
              trim={trim}
              color={color}
              bodyStyle={bodyStyle}
              drivetrain={drivetrain}
              onYearChange={setYear}
              onMakeChange={setMake}
              onModelChange={setModel}
              onTrimChange={setTrim}
              onColorChange={setColor}
              onBodyStyleChange={setBodyStyle}
              onDrivetrainChange={setDrivetrain}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Odometer" name="odometer" type="number" defaultValue={purchase.odometer} readOnly={!canEdit} />
              <SelectField
                label="Buyer"
                name="buyer_id"
                defaultValue={purchase.buyer_id ?? ""}
                disabled={!canEdit}
                options={[
                  { value: "", label: "—" },
                  ...activeBuyers.map((b) => ({ value: b.id, label: b.name })),
                ]}
              />
            </div>
          </div>

          <div className={tab === "Acquisition" ? "grid grid-cols-2 gap-3" : "hidden"}>
            <div className="col-span-2">
              <SelectField
                label="Purchase source"
                name="source_type"
                defaultValue={purchase.source_type}
                disabled={!canEdit}
                options={ACQ_SOURCE_TYPES.map((s) => ({ value: s, label: ACQ_SOURCE_LABELS[s] }))}
              />
            </div>
            <Field label="Auction house / seller" name="seller_name" defaultValue={purchase.seller_name} readOnly={!canEdit} />
            <Field label="Purchase date" name="purchase_date" type="date" defaultValue={purchase.purchase_date} readOnly={!canEdit} />
            <Field label="CR grade" name="cr_grade" defaultValue={purchase.cr_grade} readOnly={!canEdit} />
            <Field label="Purchase price" name="purchase_price" type="number" step="0.01" defaultValue={purchase.purchase_price} readOnly={!canEdit} />
            <Field label="Auction fees" name="auction_fees" type="number" step="0.01" defaultValue={purchase.auction_fees} readOnly={!canEdit} />
            <Field label="Transport cost" name="transport_cost" type="number" step="0.01" defaultValue={purchase.transport_cost} readOnly={!canEdit} />
            <Field label="Estimate recon" name="recon_estimate" type="number" step="0.01" defaultValue={purchase.recon_estimate} readOnly={!canEdit} />
            <Field label="MMR" name="purchase_mmr" type="number" step="0.01" defaultValue={purchase.purchase_mmr} readOnly={!canEdit} />
            <Field label="JD Power Clean Trade" name="purchase_jd" type="number" step="0.01" defaultValue={purchase.purchase_jd} readOnly={!canEdit} />
          </div>

          <div className={tab === "Books" ? "space-y-1" : "hidden"}>
            <ReadRow label="MMR at purchase" value={formatMoney(purchase.purchase_mmr)} />
            <ReadRow label="Current MMR" value={formatMoney(mmrNow)} />
            <ReadRow
              label="MMR change"
              value={formatDelta(mmrDelta)}
              tone={mmrDelta == null ? IC.muted : mmrDelta >= 0 ? IC.green : IC.red}
            />
            <ReadRow label="JD Power Clean Trade at purchase" value={formatMoney(purchase.purchase_jd)} />
            <ReadRow label="Current JD Power Clean Trade" value={formatMoney(jdNow)} />
            <ReadRow
              label="JD change"
              value={formatDelta(jdDelta)}
              tone={jdDelta == null ? IC.muted : jdDelta >= 0 ? IC.green : IC.red}
            />
            {/* Keep purchase books in form for save when other tabs active */}
            <input type="hidden" name="purchase_mmr" value={purchase.purchase_mmr ?? ""} />
            <input type="hidden" name="purchase_jd" value={purchase.purchase_jd ?? ""} />
          </div>

          <div className={tab === "Recon" ? "space-y-3" : "hidden"}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Delivery date" name="delivery_date" type="date" defaultValue={purchase.delivery_date} readOnly={!canEdit} />
              <Field label="Frontline date" name="frontline_date" type="date" defaultValue={purchase.frontline_date} readOnly={!canEdit} />
              <Field label="Actual reconditioning cost" name="recon_cost" type="number" step="0.01" defaultValue={purchase.recon_cost} readOnly={!canEdit} />
            </div>
            <div className="space-y-2">
              <CheckField label="Description" name="recon_description_done" defaultChecked={purchase.recon_description_done} disabled={!canEdit} />
              <CheckField label="Merchandising" name="recon_merchandising_done" defaultChecked={purchase.recon_merchandising_done} disabled={!canEdit} />
              <CheckField label="Frontline" name="recon_frontline_done" defaultChecked={purchase.recon_frontline_done} disabled={!canEdit} />
            </div>
            <ReadRow label="Transport time (delivery − purchase)" value={transportDays != null ? `${transportDays}d` : "—"} />
            <ReadRow
              label="Recon vs estimate"
              value={formatDelta(reconMiss)}
              tone={reconMiss == null ? IC.muted : reconMiss <= 0 ? IC.green : IC.red}
            />
            <ReadRow label="Days in recon" value={daysInRecon != null ? `${daysInRecon}d` : "—"} />
            <ReadRow label="Time to line" value={timeToLine != null ? `${timeToLine}d` : "—"} />
          </div>

          <div className={tab === "Merchandising" ? "space-y-3" : "hidden"}>
            <ReadRow label="Cost" value={formatMoney(merchCost(purchase))} />
            <ReadRow label="Price" value={formatMoney(websitePrice(purchase))} />
            <ReadRow label="Markup" value={formatMoneyExact(markup(purchase))} />
            <ReadRow label="Photo count" value={purchase.live_photo_count ?? "—"} />
            <ReadRow
              label="Last sync"
              value={purchase.live_synced_at ? new Date(purchase.live_synced_at).toLocaleString() : "—"}
            />
          </div>

          <div className={tab === "Exit" ? "space-y-3" : "hidden"}>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sold date" name="sold_date" type="date" defaultValue={purchase.sold_date} readOnly={!canEdit} />
              <Field label="Sale price" name="sold_price" type="number" step="0.01" defaultValue={purchase.sold_price} readOnly={!canEdit} />
              <label className="col-span-2 block text-xs">
                <span style={{ color: IC.muted }}>Exit strategy</span>
                <select
                  name="exit_strategy"
                  value={exitStrategy}
                  disabled={!canEdit}
                  onChange={(e) => setExitStrategy(e.target.value)}
                  className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
                  style={{ background: "#0f141c", borderColor: IC.border, color: IC.text }}
                >
                  <option value="">—</option>
                  {ACQ_EXIT_STRATEGIES.map((s) => (
                    <option key={s} value={s}>
                      {ACQ_EXIT_STRATEGY_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
              <Field label="Front profit" name="front_gross" type="number" step="0.01" defaultValue={purchase.front_gross} readOnly={!canEdit} />
              <Field label="Back profit" name="back_gross" type="number" step="0.01" defaultValue={purchase.back_gross} readOnly={!canEdit} />
              <Field label="Total profit" name="total_gross" type="number" step="0.01" defaultValue={purchase.total_gross ?? totalProfit} readOnly={!canEdit} />
              {exitStrategy === "internal_transfer" ? (
                <Field
                  label="Next store profit"
                  name="next_store_profit"
                  type="number"
                  step="0.01"
                  defaultValue={purchase.next_store_profit}
                  readOnly={!canEdit}
                />
              ) : (
                <input type="hidden" name="next_store_profit" value={purchase.next_store_profit ?? ""} />
              )}
            </div>
            <ReadRow label="Sold age" value={soldAge != null ? `${soldAge}d` : "—"} />
            <ReadRow label="Age" value={currentAge != null ? `${currentAge}d` : "—"} />
            <ReadRow label="Sale over MMR" value={formatMoneyExact(saleOverMmr)} tone={saleOverMmr == null ? IC.muted : saleOverMmr >= 0 ? IC.green : IC.red} />
            <ReadRow label="Sale over JD Power Clean Trade" value={formatMoneyExact(saleOverJd)} tone={saleOverJd == null ? IC.muted : saleOverJd >= 0 ? IC.green : IC.red} />

            <div className="rounded-lg border p-3" style={{ borderColor: IC.border }}>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide">Trade info</p>
                <button
                  type="button"
                  role="switch"
                  aria-checked={hasTrade}
                  disabled={!canEdit}
                  onClick={() => setHasTrade((v) => !v)}
                  className="rounded-full px-3 py-1 text-[11px] font-semibold"
                  style={{
                    background: hasTrade ? IC.blue : IC.rowAlt,
                    color: hasTrade ? "#fff" : IC.muted,
                  }}
                >
                  {hasTrade ? "Trade on" : "No trade"}
                </button>
              </div>
              <input type="hidden" name="has_trade" value={hasTrade ? "true" : "false"} />
              {hasTrade ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Trade stock" name="trade_stock_number" defaultValue={purchase.trade_stock_number} readOnly={!canEdit} />
                  <label className="block text-xs">
                    <span style={{ color: IC.muted }}>Trade VIN</span>
                    <div className="mt-1 flex gap-1">
                      <input
                        name="trade_vin"
                        value={tradeVin}
                        onChange={(e) => setTradeVin(e.target.value.toUpperCase())}
                        readOnly={!canEdit}
                        maxLength={17}
                        className="w-full rounded-md border px-2 py-1.5 text-sm uppercase"
                        style={{ background: canEdit ? "#0f141c" : IC.rowAlt, borderColor: IC.border, color: IC.text }}
                      />
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => void handleDecode("trade")}
                          disabled={decoding}
                          className="shrink-0 rounded-md border px-2 text-[10px] font-semibold"
                          style={{ borderColor: IC.border, color: IC.blue }}
                        >
                          Decode
                        </button>
                      ) : null}
                    </div>
                  </label>
                  <Field label="Year" name="trade_year" value={tradeYear} onChange={setTradeYear} type="number" readOnly={!canEdit} />
                  <Field label="Make" name="trade_make" value={tradeMake} onChange={setTradeMake} readOnly={!canEdit} />
                  <Field label="Model" name="trade_model" value={tradeModel} onChange={setTradeModel} readOnly={!canEdit} />
                  <Field label="ACV" name="trade_acv" type="number" step="0.01" defaultValue={purchase.trade_acv} readOnly={!canEdit} />
                  <Field label="Allowance" name="trade_allowance" type="number" step="0.01" defaultValue={purchase.trade_allowance} readOnly={!canEdit} />
                </div>
              ) : null}
            </div>
          </div>

          {/* Persist fields across tabs */}
          {tab !== "Overview" ? (
            <>
              <input type="hidden" name="stock_number" value={purchase.stock_number ?? ""} />
              <input type="hidden" name="buyer_id" value={purchase.buyer_id ?? ""} />
              <input type="hidden" name="odometer" value={purchase.odometer ?? ""} />
              <input type="hidden" name="vehicle_year" value={year} />
              <input type="hidden" name="vehicle_make" value={make} />
              <input type="hidden" name="vehicle_model" value={model} />
              <input type="hidden" name="vehicle_trim" value={trim} />
              <input type="hidden" name="color" value={color} />
              <input type="hidden" name="body_style" value={bodyStyle} />
              <input type="hidden" name="drivetrain" value={drivetrain} />
            </>
          ) : null}
          {tab !== "Acquisition" ? (
            <>
              <input type="hidden" name="source_type" value={purchase.source_type} />
              <input type="hidden" name="seller_name" value={purchase.seller_name ?? ""} />
              <input type="hidden" name="purchase_date" value={purchase.purchase_date ?? ""} />
              <input type="hidden" name="cr_grade" value={purchase.cr_grade ?? ""} />
              <input type="hidden" name="purchase_price" value={purchase.purchase_price ?? ""} />
              <input type="hidden" name="auction_fees" value={purchase.auction_fees ?? ""} />
              <input type="hidden" name="transport_cost" value={purchase.transport_cost ?? ""} />
              <input type="hidden" name="recon_estimate" value={purchase.recon_estimate ?? ""} />
              {tab !== "Books" ? (
                <>
                  <input type="hidden" name="purchase_mmr" value={purchase.purchase_mmr ?? ""} />
                  <input type="hidden" name="purchase_jd" value={purchase.purchase_jd ?? ""} />
                </>
              ) : null}
            </>
          ) : null}
          {tab !== "Recon" ? (
            <>
              <input type="hidden" name="recon_cost" value={purchase.recon_cost ?? ""} />
              <input type="hidden" name="delivery_date" value={purchase.delivery_date ?? ""} />
              <input type="hidden" name="frontline_date" value={purchase.frontline_date ?? ""} />
              {purchase.recon_description_done ? <input type="hidden" name="recon_description_done" value="true" /> : null}
              {purchase.recon_merchandising_done ? <input type="hidden" name="recon_merchandising_done" value="true" /> : null}
              {purchase.recon_frontline_done ? <input type="hidden" name="recon_frontline_done" value="true" /> : null}
            </>
          ) : null}
          {tab !== "Exit" ? (
            <>
              <input type="hidden" name="sold_date" value={purchase.sold_date ?? ""} />
              <input type="hidden" name="sold_price" value={purchase.sold_price ?? ""} />
              <input type="hidden" name="exit_strategy" value={exitStrategy} />
              <input type="hidden" name="front_gross" value={purchase.front_gross ?? ""} />
              <input type="hidden" name="back_gross" value={purchase.back_gross ?? ""} />
              <input type="hidden" name="total_gross" value={purchase.total_gross ?? ""} />
              <input type="hidden" name="next_store_profit" value={purchase.next_store_profit ?? ""} />
              <input type="hidden" name="has_trade" value={hasTrade ? "true" : "false"} />
              <input type="hidden" name="trade_stock_number" value={purchase.trade_stock_number ?? ""} />
              <input type="hidden" name="trade_vin" value={tradeVin} />
              <input type="hidden" name="trade_year" value={tradeYear} />
              <input type="hidden" name="trade_make" value={tradeMake} />
              <input type="hidden" name="trade_model" value={tradeModel} />
              <input type="hidden" name="trade_acv" value={purchase.trade_acv ?? ""} />
              <input type="hidden" name="trade_allowance" value={purchase.trade_allowance ?? ""} />
            </>
          ) : null}
        </div>

        {canEdit ? (
          <footer className="flex items-center justify-between gap-3 border-t px-4 py-3" style={{ borderColor: IC.border }}>
            {error ? <p className="text-xs" style={{ color: IC.red }}>{error}</p> : <span className="text-xs" style={{ color: IC.muted }}>Platform admin edit</span>}
            <button type="submit" disabled={pending} className="rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-60" style={{ background: IC.blue }}>
              {pending ? "Saving…" : "Save card"}
            </button>
          </footer>
        ) : (
          <footer className="border-t px-4 py-3 text-xs" style={{ borderColor: IC.border, color: IC.muted }}>
            View only — platform admins can edit Acquire purchases.
          </footer>
        )}
      </form>
    </div>
  );
}
