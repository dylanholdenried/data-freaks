"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Loader2, PlusCircle, Trash2, XCircle } from "lucide-react";
import { BODY_STYLES, DRIVETRAINS, decodeVin, isMakeAllowedForDepartment, VinDecodeError } from "@/lib/vehicle";
import { cn } from "@/lib/utils";

type Store = { id: string; name: string };
type Department = { id: string; name: string; store_id: string };
type Salesperson = { id: string; name: string; store_id: string };

interface Props {
  userId: string;
  stores: Store[];
  departments: Department[];
  salespeople: Salesperson[];
  vehicleMakes: { id: string; name: string }[];
  vehicleModels: { id: string; name: string; make_id: string }[];
  departmentMakes: { department_id: string; make: string }[];
}

type Trade = {
  year: string;
  make: string;
  model: string;
  acv: string;
  allowance: string;
  exit_strategy: string;
};

type Split = {
  salesperson_id: string;
  share: string; // UI display: "100" = 100%; stored in DB as whole number
};

const emptyTrade = (): Trade => ({
  year: "",
  make: "",
  model: "",
  acv: "",
  allowance: "",
  exit_strategy: "",
});

// Matches the styling of the Input component so selects are visually consistent
const SEL =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground " +
  "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const LBL = "text-xs font-medium text-muted-foreground";

function emptyCls(value: string) {
  return !value.trim()
    ? "border-red-400 bg-[color-mix(in_srgb,var(--da-red)_12%,transparent)] focus-visible:ring-red-400 focus:ring-red-400"
    : "";
}

export default function NewDealForm({
  userId,
  stores,
  departments,
  salespeople,
  vehicleMakes,
  vehicleModels,
  departmentMakes,
}: Props) {
  // ── Form state ──────────────────────────────────────────────────────────────
  const [storeId, setStoreId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [saleDate, setSaleDate] = useState("");
  const [customerLastName, setCustomerLastName] = useState("");
  const [stockNumber, setStockNumber] = useState("");
  const [vehicleYear, setVehicleYear] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [splits, setSplits] = useState<Split[]>([{ salesperson_id: "", share: "100" }]);
  const [hasTrade, setHasTrade] = useState(false);
  const [trades, setTrades] = useState<Trade[]>([emptyTrade()]);
  const [notes, setNotes] = useState("");

  // ── VIN decode state ─────────────────────────────────────────────────────────
  const [vin, setVin] = useState("");
  const [trim, setTrim] = useState("");
  const [bodyStyle, setBodyStyle] = useState("");
  const [drivetrain, setDrivetrain] = useState("");
  const [decoding, setDecoding] = useState(false);
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [makeId, setMakeId] = useState("");
  const [makeIsManual, setMakeIsManual] = useState(false);
  const [modelId, setModelId] = useState("");
  const [modelIsManual, setModelIsManual] = useState(false);
  const [decoded, setDecoded] = useState(false);

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [savedDeal, setSavedDeal] = useState<{
    stockNumber: string;
    customerLastName: string;
  } | null>(null);

  // ── Derived: filter dropdown options to selected store ───────────────────────
  const storeDepts = departments.filter((d) => d.store_id === storeId);
  const storeSalespeople = salespeople.filter((sp) => sp.store_id === storeId);
  const makeDeptMismatch =
    Boolean(vehicleMake.trim()) &&
    Boolean(departmentId) &&
    !isMakeAllowedForDepartment(vehicleMake, departmentId, departmentMakes);
  const selectedDeptName =
    departments.find((d) => d.id === departmentId)?.name ?? "this department";

  // ── Store change: reset dependent fields ────────────────────────────────────
  function handleStoreChange(id: string) {
    setStoreId(id);
    setDepartmentId("");
    setSplits([{ salesperson_id: "", share: "100" }]);
  }

  // ── VIN Decoder ──────────────────────────────────────────────────────────────
  async function handleDecodeVin() {
    const v = vin.trim();
    if (v.length !== 17) return;

    setDecoding(true);
    setDecodeError(null);

    try {
      const d = await decodeVin(v);

      if (d.year !== null) setVehicleYear(String(d.year));

      const matchedMake = vehicleMakes.find(
        (m) => m.name.toLowerCase() === d.make.toLowerCase()
      );
      let resolvedMakeId = "";
      if (matchedMake) {
        setMakeId(matchedMake.id);
        resolvedMakeId = matchedMake.id;
        setMakeIsManual(false);
      } else {
        setMakeId("");
        setMakeIsManual(true);
      }
      setVehicleMake(d.make);

      const matchedModel = vehicleModels.find(
        (m) =>
          m.make_id === resolvedMakeId &&
          m.name.toLowerCase() === d.model.toLowerCase()
      );
      if (matchedModel) {
        setModelId(matchedModel.id);
        setModelIsManual(false);
      } else {
        setModelId("");
        setModelIsManual(true);
      }
      setVehicleModel(d.model);

      setTrim(d.trim);
      if (d.bodyStyle) setBodyStyle(d.bodyStyle);
      if (d.drivetrain) setDrivetrain(d.drivetrain);

      setDecoded(true);
    } catch (err) {
      if (err instanceof VinDecodeError) {
        setDecodeError(err.message);
      } else {
        setDecodeError("Could not decode this VIN — enter details manually.");
      }
    } finally {
      setDecoding(false);
    }
  }

  // ── Salesperson split helpers ────────────────────────────────────────────────
  function addSplit() {
    setSplits([{ ...splits[0], share: "50" }, { salesperson_id: "", share: "50" }]);
  }

  function removeSplit(idx: number) {
    const next = splits.filter((_, i) => i !== idx);
    if (next.length === 1) next[0] = { ...next[0], share: "100" };
    setSplits(next);
  }

  function updateSplit(idx: number, field: keyof Split, value: string) {
    setSplits(splits.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  }

  // ── Trade helpers ────────────────────────────────────────────────────────────
  function addTrade() {
    setTrades([...trades, emptyTrade()]);
  }

  function removeTrade(idx: number) {
    setTrades(trades.length === 1 ? [emptyTrade()] : trades.filter((_, i) => i !== idx));
  }

  function updateTrade(idx: number, field: keyof Trade, value: string) {
    setTrades(trades.map((t, i) => (i === idx ? { ...t, [field]: value } : t)));
  }

  // ── Form reset ───────────────────────────────────────────────────────────────
  function resetForm() {
    setStoreId("");
    setDepartmentId("");
    setSaleDate("");
    setCustomerLastName("");
    setStockNumber("");
    setVehicleYear("");
    setVehicleMake("");
    setVehicleModel("");
    setSplits([{ salesperson_id: "", share: "100" }]);
    setHasTrade(false);
    setTrades([emptyTrade()]);
    setNotes("");
    setErrors([]);
    setVin("");
    setTrim("");
    setBodyStyle("");
    setDrivetrain("");
    setDecoding(false);
    setDecodeError(null);
    setMakeId("");
    setMakeIsManual(false);
    setModelId("");
    setModelIsManual(false);
    setDecoded(false);
  }

  // ── Validation ───────────────────────────────────────────────────────────────
  function validate(): string[] {
    const errs: string[] = [];
    if (!storeId) errs.push("Store is required");
    if (!departmentId) errs.push("Department is required");
    if (!saleDate) errs.push("Sale date is required");
    if (!customerLastName.trim()) errs.push("Customer last name is required");
    if (!stockNumber.trim()) errs.push("Stock number is required");
    if (!vehicleYear.trim()) errs.push("Vehicle year is required");
    if (!vehicleMake.trim()) errs.push("Vehicle make is required");
    if (!vehicleModel.trim()) errs.push("Vehicle model is required");
    if (splits.every((s) => !s.salesperson_id)) errs.push("At least one salesperson is required");
    if (hasTrade) {
      trades.forEach((t, i) => {
        const label = trades.length > 1 ? ` (trade ${i + 1})` : "";
        if (!t.year.trim()) errs.push(`Trade year is required${label}`);
        if (!t.make.trim()) errs.push(`Trade make is required${label}`);
        if (!t.model.trim()) errs.push(`Trade model is required${label}`);
        if (!t.acv.trim()) errs.push(`Trade ACV is required${label}`);
        if (!t.exit_strategy) errs.push(`Trade exit strategy is required${label}`);
      });
    }
    return errs;
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  async function handleSave() {
    const errs = validate();
    if (errs.length > 0) {
      setErrors(errs);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setErrors([]);
    setSaving(true);

    // Capture display values before state is reset
    const savedStock = stockNumber.trim();
    const savedCustomer = customerLastName.trim();
    const savedMake = vehicleMake.trim();
    const shouldFlagMismatch = makeDeptMismatch;

    try {
      const supabase = createSupabaseBrowserClient();

      // 1. Insert deal
      const { data: deal, error: dealError } = await supabase
        .from("deals")
        .insert({
          store_id: storeId,
          department_id: departmentId,
          customer_last_name: customerLastName.trim(),
          sale_date: saleDate,
          stock_number: stockNumber.trim(),
          vehicle_year: parseInt(vehicleYear, 10),
          vehicle_make: savedMake,
          vehicle_model: vehicleModel.trim(),
          vin: vin.trim() || null,
          trim: trim.trim() || null,
          body_style: bodyStyle || null,
          drivetrain: drivetrain || null,
          status: "pending",
          entered_by: userId,
        })
        .select("id")
        .single();

      if (dealError) throw new Error(`Deal insert failed: ${dealError.message}`);
      const dealId = deal.id;

      // 1b. Flag make/department mismatch (warn-only; save was already allowed)
      if (shouldFlagMismatch) {
        const { error: flagError } = await supabase.from("deal_flags").insert({
          deal_id: dealId,
          flag_type: "make_dept_mismatch",
          detail: `${savedMake} not allowed for department`,
        });
        if (flagError) throw new Error(`Deal flag insert failed: ${flagError.message}`);
      }

      // 2. Insert deal_salespeople (share stored as whole number: 100% → 100)
      const activeSplits = splits.filter((s) => s.salesperson_id);
      if (activeSplits.length > 0) {
        const { error: spError } = await supabase.from("deal_salespeople").insert(
          activeSplits.map((s) => ({
            deal_id: dealId,
            salesperson_id: s.salesperson_id,
            share_percent: parseFloat(s.share),
          }))
        );
        if (spError) throw new Error(`Salesperson link failed: ${spError.message}`);
      }

      // 3. Insert trades
      if (hasTrade) {
        const { error: tradeError } = await supabase.from("trades").insert(
          trades.map((t) => ({
            deal_id: dealId,
            year: parseInt(t.year, 10),
            make: t.make.trim(),
            model: t.model.trim(),
            acv: parseFloat(t.acv),
            allowance: t.allowance.trim() ? parseFloat(t.allowance) : null,
            exit_strategy: t.exit_strategy,
          }))
        );
        if (tradeError) throw new Error(`Trade insert failed: ${tradeError.message}`);
      }

      // 4. Insert note
      if (notes.trim()) {
        const { error: noteError } = await supabase
          .from("deal_notes")
          .insert({ deal_id: dealId, note: notes.trim() });
        if (noteError) throw new Error(`Note insert failed: ${noteError.message}`);
      }

      // Show success, reset for next entry
      setSavedDeal({ stockNumber: savedStock, customerLastName: savedCustomer });
      resetForm();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred. Please try again.";
      setErrors([msg]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Page header */}
      <section className="app-panel p-5">
        <p className="app-kicker">Transaction Intake</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">New Deal</h1>
        <p className="mt-1 text-sm text-muted-foreground">Step 1 — Add Deal. Saves as Pending.</p>
      </section>

      {/* Success banner — stays visible while form is reset for next entry */}
      {savedDeal && (
        <div className="flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 p-5">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-green-800">Deal saved as Pending</p>
            <p className="mt-0.5 text-sm text-green-700">
              Stock{" "}
              <span className="font-mono font-semibold">#{savedDeal.stockNumber}</span>
              {" · "}
              {savedDeal.customerLastName} — entered successfully. Form is ready for next entry.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSavedDeal(null)}
            className="shrink-0 text-xs text-green-600 underline hover:text-green-900"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Validation errors */}
      {errors.length > 0 && (
        <div className="rounded-2xl border border-[color-mix(in_srgb,var(--da-red)_35%,transparent)] bg-[color-mix(in_srgb,var(--da-red)_12%,transparent)] p-5">
          <p className="mb-2 text-sm font-semibold text-[var(--da-red)]">
            Please fix the following before saving:
          </p>
          <ul className="list-inside list-disc space-y-0.5">
            {errors.map((e, i) => (
              <li key={i} className="text-sm text-[var(--da-red)]">
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Make / department mismatch — warn only; save still allowed */}
      {makeDeptMismatch && (
        <div className="rounded-2xl border border-[color-mix(in_srgb,var(--da-amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--da-amber)_12%,transparent)] p-5">
          <p className="text-sm font-semibold text-amber-900">Make / department mismatch</p>
          <p className="mt-1 text-sm text-amber-800">
            <span className="font-medium">{vehicleMake.trim()}</span> is not allowed for{" "}
            <span className="font-medium">{selectedDeptName}</span>. You can still save; this
            deal will be flagged.
          </p>
        </div>
      )}

      {/* ── Store & Department ─────────────────────────────────────────────── */}
      <Card className="app-panel border-border shadow-none">
        <CardHeader className="border-border">
          <CardTitle className="text-lg">Store & Department</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className={LBL}>Store *</label>
              <select
                value={storeId}
                onChange={(e) => handleStoreChange(e.target.value)}
                className={cn(SEL, emptyCls(storeId))}
              >
                <option value="">Select store</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className={LBL}>Department *</label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                disabled={!storeId}
                className={cn(SEL, emptyCls(departmentId))}
              >
                <option value="">
                  {storeId ? "Select department" : "Select a store first"}
                </option>
                {storeDepts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Deal Details ───────────────────────────────────────────────────── */}
      <Card className="app-panel border-border shadow-none">
        <CardHeader className="border-border">
          <CardTitle className="text-lg">Deal Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* VIN */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1 sm:col-span-2">
              <label className={LBL}>VIN (optional)</label>
              <div className="flex gap-2">
                <Input
                  value={vin}
                  onChange={(e) => {
                    setVin(e.target.value);
                    setDecodeError(null);
                    setDecoded(false);
                  }}
                  onBlur={() => {
                    if (vin.trim().length === 17) handleDecodeVin();
                  }}
                  disabled={decoding}
                  className={`font-mono ${emptyCls(vin)}`}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDecodeVin}
                  disabled={vin.trim().length !== 17 || decoding}
                  className="shrink-0"
                >
                  {decoding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Decode VIN"
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Decode success indicator */}
          {decoded && (
            <p className="text-sm text-green-700">
              ✓ Decoded from VIN —{" "}
              <button
                type="button"
                onClick={() => setDecoded(false)}
                className="text-xs text-green-600 underline hover:text-green-900"
              >
                Edit manually
              </button>
            </p>
          )}

          {/* Decode error */}
          {decodeError && (
            <div className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--da-amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--da-amber)_12%,transparent)] p-3">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="flex-1 text-sm text-amber-800">{decodeError}</p>
              <button
                type="button"
                onClick={() => setDecodeError(null)}
                className="shrink-0 text-xs text-amber-600 underline hover:text-amber-900"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Sale Date | Customer Last Name | Stock # */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <label className={LBL}>Sale Date *</label>
              <Input
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                className={emptyCls(saleDate)}
              />
            </div>
            <div className="space-y-1">
              <label className={LBL}>Customer Last Name *</label>
              <Input
                value={customerLastName}
                onChange={(e) => setCustomerLastName(e.target.value)}
                className={emptyCls(customerLastName)}
              />
            </div>
            <div className="space-y-1">
              <label className={LBL}>Stock # *</label>
              <Input
                value={stockNumber}
                onChange={(e) => setStockNumber(e.target.value)}
                className={emptyCls(stockNumber)}
              />
            </div>
          </div>

          {/* Year | Make | Model */}
          <div className="grid gap-4 sm:grid-cols-3">

            {/* Year */}
            <div className="space-y-1">
              <label className={LBL}>Year *</label>
              <Input
                type="number"
                value={vehicleYear}
                onChange={(e) => setVehicleYear(e.target.value)}
                min={1900}
                max={2100}
                disabled={decoded}
                className={emptyCls(vehicleYear)}
              />
            </div>

            {/* Make */}
            <div className="space-y-1">
              <label className={LBL}>Make *</label>
              {makeIsManual ? (
                <>
                  <Input
                    value={vehicleMake}
                    onChange={(e) => setVehicleMake(e.target.value)}
                    disabled={decoded}
                    className={emptyCls(vehicleMake)}
                  />
                  {!decoded && (
                    <p className="text-xs text-amber-600">
                      ⚠ Not in vehicle list — verify or ask an admin to add it
                    </p>
                  )}
                </>
              ) : (
                <select
                  value={makeId}
                  onChange={(e) => {
                    const id = e.target.value;
                    const found = vehicleMakes.find((m) => m.id === id);
                    setMakeId(id);
                    setVehicleMake(found?.name ?? "");
                    setModelId("");
                    setVehicleModel("");
                    setModelIsManual(false);
                  }}
                  disabled={decoded}
                  className={cn(SEL, emptyCls(makeId))}
                >
                  <option value="">Select make</option>
                  {vehicleMakes.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Model */}
            <div className="space-y-1">
              <label className={LBL}>Model *</label>
              {makeIsManual || modelIsManual ? (
                <>
                  <Input
                    value={vehicleModel}
                    onChange={(e) => setVehicleModel(e.target.value)}
                    disabled={decoded}
                    className={emptyCls(vehicleModel)}
                  />
                  {modelIsManual && !makeIsManual && !decoded && (
                    <p className="text-xs text-amber-600">
                      ⚠ Not in vehicle list — verify or ask an admin to add it
                    </p>
                  )}
                </>
              ) : (
                <select
                  value={modelId}
                  onChange={(e) => {
                    const id = e.target.value;
                    const found = vehicleModels.find((m) => m.id === id);
                    setModelId(id);
                    setVehicleModel(found?.name ?? "");
                  }}
                  disabled={decoded || !makeId}
                  className={cn(SEL, emptyCls(modelId))}
                >
                  <option value="">{makeId ? "Select model" : "Select make first"}</option>
                  {vehicleModels
                    .filter((m) => m.make_id === makeId)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              )}
            </div>

          </div>

          {/* Trim | Body Style | Drivetrain */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <label className={LBL}>Trim</label>
              <Input
                value={trim}
                onChange={(e) => setTrim(e.target.value)}
                className={emptyCls(trim)}
              />
            </div>
            <div className="space-y-1">
              <label className={LBL}>Body Style</label>
              <select
                value={bodyStyle}
                onChange={(e) => setBodyStyle(e.target.value)}
                className={cn(SEL, emptyCls(bodyStyle))}
              >
                <option value="">Select body style</option>
                {BODY_STYLES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className={LBL}>Drivetrain</label>
              <select
                value={drivetrain}
                onChange={(e) => setDrivetrain(e.target.value)}
                className={cn(SEL, emptyCls(drivetrain))}
              >
                <option value="">Select drivetrain</option>
                {DRIVETRAINS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

        </CardContent>
      </Card>

      {/* ── Salesperson(s) ─────────────────────────────────────────────────── */}
      <Card className="app-panel border-border shadow-none">
        <CardHeader className="border-border">
          <CardTitle className="text-lg">Salesperson(s)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {splits.map((split, idx) => (
            <div key={idx} className="flex items-end gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                {idx === 0 && <label className={LBL}>Salesperson *</label>}
                <select
                  value={split.salesperson_id}
                  onChange={(e) => updateSplit(idx, "salesperson_id", e.target.value)}
                  disabled={!storeId}
                  className={cn(SEL, emptyCls(split.salesperson_id))}
                >
                  <option value="">
                    {!storeId
                      ? "Select a store first"
                      : storeSalespeople.length === 0
                      ? "No active salespeople for this store"
                      : "Select salesperson"}
                  </option>
                  {storeSalespeople.map((sp) => (
                    <option key={sp.id} value={sp.id}>
                      {sp.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-28 space-y-1">
                {idx === 0 && <label className={LBL}>Split %</label>}
                <div className="relative">
                  <Input
                    type="number"
                    value={split.share}
                    onChange={(e) => updateSplit(idx, "share", e.target.value)}
                    min={0}
                    max={100}
                    className={`pr-7 ${emptyCls(split.share)}`}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    %
                  </span>
                </div>
              </div>
              {splits.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeSplit(idx)}
                  className="shrink-0 text-muted-foreground hover:text-red-500"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}

          {splits.length < 2 && storeId && storeSalespeople.length > 1 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addSplit}
              className="mt-1"
            >
              <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
              Split with second salesperson
            </Button>
          )}
        </CardContent>
      </Card>

      {/* ── Trade-In ───────────────────────────────────────────────────────── */}
      <Card className="app-panel border-border shadow-none">
        <CardHeader className="border-border">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Trade-In</CardTitle>
            <label className="flex cursor-pointer items-center gap-2">
              <span className="text-xs text-muted-foreground">Has trade?</span>
              <button
                type="button"
                role="switch"
                aria-checked={hasTrade}
                onClick={() => setHasTrade((v) => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  hasTrade ? "bg-[var(--da-blue)]" : "bg-[var(--da-line)]"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-card shadow-lg transition-transform ${
                    hasTrade ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </label>
          </div>
        </CardHeader>

        {hasTrade && (
          <CardContent className="space-y-4">
            {trades.map((trade, idx) => (
              <div
                key={idx}
                className="space-y-3 rounded-xl border border-border bg-muted p-4"
              >
                {trades.length > 1 && (
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Trade {idx + 1}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeTrade(idx)}
                      className="h-7 px-2 text-muted-foreground hover:text-red-500"
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Remove
                    </Button>
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <label className={LBL}>Year *</label>
                    <Input
                      type="number"
                      value={trade.year}
                      onChange={(e) => updateTrade(idx, "year", e.target.value)}
                      className={emptyCls(trade.year)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={LBL}>Make *</label>
                    <Input
                      value={trade.make}
                      onChange={(e) => updateTrade(idx, "make", e.target.value)}
                      className={emptyCls(trade.make)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={LBL}>Model *</label>
                    <Input
                      value={trade.model}
                      onChange={(e) => updateTrade(idx, "model", e.target.value)}
                      className={emptyCls(trade.model)}
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <label className={LBL}>ACV *</label>
                    <Input
                      type="number"
                      value={trade.acv}
                      onChange={(e) => updateTrade(idx, "acv", e.target.value)}
                      className={emptyCls(trade.acv)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={LBL}>Allowance</label>
                    <Input
                      type="number"
                      value={trade.allowance}
                      onChange={(e) => updateTrade(idx, "allowance", e.target.value)}
                      className={emptyCls(trade.allowance)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={LBL}>Exit Strategy *</label>
                    <select
                      value={trade.exit_strategy}
                      onChange={(e) => updateTrade(idx, "exit_strategy", e.target.value)}
                      className={cn(SEL, emptyCls(trade.exit_strategy))}
                    >
                      <option value="">Select...</option>
                      <option value="retail">Retail</option>
                      <option value="wholesale">Wholesale</option>
                      <option value="unknown">Unknown</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}

            <Button type="button" variant="outline" size="sm" onClick={addTrade}>
              <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
              Add another trade
            </Button>
          </CardContent>
        )}
      </Card>

      {/* ── Notes ─────────────────────────────────────────────────────────── */}
      <Card className="app-panel border-border shadow-none">
        <CardHeader className="border-border">
          <CardTitle className="text-lg">Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className={cn(
              "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              emptyCls(notes)
            )}
          />
        </CardContent>
      </Card>

      {/* ── Save action ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-3 pb-6">
        <Button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="min-w-[160px]"
        >
          {saving ? "Saving…" : "Save as Pending"}
        </Button>
      </div>
    </div>
  );
}
