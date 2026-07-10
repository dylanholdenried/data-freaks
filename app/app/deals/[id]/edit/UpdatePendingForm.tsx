"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, XCircle } from "lucide-react";

type TradeRow = {
  year: number | null;
  make: string | null;
  model: string | null;
  acv: number | null;
  exit_strategy: string | null;
};

interface Props {
  // Identifiers
  dealId: string;
  // Read-only context
  stockNumber: string;
  customerLastName: string;
  vehicleYear: number;
  vehicleMake: string;
  vehicleModel: string;
  storeName: string;
  departmentName: string;
  // Pre-filled Step 2 fields (null = not yet entered)
  initialVin: string | null;
  initialTrim: string | null;
  initialColor: string | null;
  initialBodyStyle: string | null;
  initialDrivetrain: string | null;
  initialOdometer: number | null;
  initialAcquisitionSource: string | null;
  initialFinanceType: string | null;
  initialFinanceManagerId: string | null;
  initialFrontProfit: number | null;
  initialBackProfit: number | null;
  initialSalePrice: number | null;
  initialAge: number | null;
  // Dropdown options
  acquisitionSources: { id: string; name: string }[];
  financeManagers: { id: string; name: string }[];
  // Close gate data (fetched server-side from deal_salespeople + trades)
  salespeopleCount: number;
  shareSum: number; // decimal: 1.0 = 100%
  trades: TradeRow[];
}

// Mirrors the Input component's border/focus styling so selects are consistent
const SEL =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm " +
  "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const LBL = "text-xs font-medium text-slate-500";

// Convert a nullable number to a string for controlled inputs (blank if null)
function numStr(v: number | null): string {
  return v !== null ? String(v) : "";
}

export default function UpdatePendingForm({
  dealId,
  stockNumber,
  customerLastName,
  vehicleYear,
  vehicleMake,
  vehicleModel,
  storeName,
  departmentName,
  initialVin,
  initialTrim,
  initialColor,
  initialBodyStyle,
  initialDrivetrain,
  initialOdometer,
  initialAcquisitionSource,
  initialFinanceType,
  initialFinanceManagerId,
  initialFrontProfit,
  initialBackProfit,
  initialSalePrice,
  initialAge,
  acquisitionSources,
  financeManagers,
  salespeopleCount,
  shareSum,
  trades,
}: Props) {
  const router = useRouter();

  // ── Editable field state (all strings for controlled inputs) ─────────────────
  const [vin, setVin] = useState(initialVin ?? "");
  const [trim, setTrim] = useState(initialTrim ?? "");
  const [color, setColor] = useState(initialColor ?? "");
  const [bodyStyle, setBodyStyle] = useState(initialBodyStyle ?? "");
  const [drivetrain, setDrivetrain] = useState(initialDrivetrain ?? "");
  const [odometer, setOdometer] = useState(numStr(initialOdometer));
  const [acquisitionSource, setAcquisitionSource] = useState(
    initialAcquisitionSource ?? ""
  );
  const [financeType, setFinanceType] = useState(initialFinanceType ?? "");
  const [financeManagerId, setFinanceManagerId] = useState(
    initialFinanceManagerId ?? ""
  );
  const [frontProfit, setFrontProfit] = useState(numStr(initialFrontProfit));
  const [backProfit, setBackProfit] = useState(numStr(initialBackProfit));
  const [salePrice, setSalePrice] = useState(numStr(initialSalePrice));
  const [age, setAge] = useState(numStr(initialAge));

  // ── UI state ──────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const [closing, setClosing] = useState(false);
  const [closeErrors, setCloseErrors] = useState<string[]>([]);
  const [closed, setClosed] = useState(false);

  // ── Shared Step 2 payload builder ────────────────────────────────────────────
  // Empty string → null. Integers via parseInt, decimals via parseFloat.
  // Never writes status or non-existent columns.
  function buildPayload() {
    return {
      vin: vin.trim() || null,
      trim: trim.trim() || null,
      color: color.trim() || null,
      body_style: bodyStyle.trim() || null,
      drivetrain: drivetrain.trim() || null,
      odometer: odometer.trim() ? parseInt(odometer, 10) : null,
      acquisition_source: acquisitionSource || null,
      finance_type: financeType || null,
      finance_manager_id: financeManagerId || null,
      front_profit: frontProfit.trim() !== "" ? parseFloat(frontProfit) : null,
      back_profit: backProfit.trim() !== "" ? parseFloat(backProfit) : null,
      sale_price: salePrice.trim() !== "" ? parseFloat(salePrice) : null,
      age: age.trim() ? parseInt(age, 10) : null,
    };
  }

  // ── Save Progress handler ─────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setErrors([]);
    setCloseErrors([]); // clear any lingering close errors when user saves progress

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("deals")
        .update(buildPayload())
        .eq("id", dealId);

      if (error) throw new Error(error.message);

      setSaved(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred. Please try again.";
      setErrors([msg]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(false);
    }
  }

  // ── Close gate validation ─────────────────────────────────────────────────────
  function validateForClose(): string[] {
    const errs: string[] = [];

    // Vehicle details
    if (!vin.trim()) errs.push("VIN is required");
    if (!trim.trim()) errs.push("Trim is required");
    if (!color.trim()) errs.push("Color is required");
    if (!bodyStyle.trim()) errs.push("Body style is required");
    if (!drivetrain.trim()) errs.push("Drivetrain is required");
    if (!odometer.trim()) errs.push("Odometer is required");

    // Acquisition & finance
    if (!acquisitionSource) errs.push("Acquisition source is required");
    if (!financeType) errs.push("Finance type is required");

    // Financials — 0 is valid, blank is not. Never check === "0".
    if (frontProfit.trim() === "")
      errs.push("Front gross is required (enter 0 if zero)");
    if (backProfit.trim() === "")
      errs.push("Back gross is required (enter 0 if zero)");
    if (!salePrice.trim()) errs.push("Sale price is required");
    if (!age.trim()) errs.push("Age is required");

    // Salespeople — count and share sum (shares stored as decimal, 1.0 = 100%)
    if (salespeopleCount < 1) {
      errs.push("At least one salesperson is required");
    } else if (Math.abs(shareSum - 1) >= 0.001) {
      errs.push(
        `Salesperson splits must total 100% (currently ${Math.round(shareSum * 100)}%)`
      );
    }

    // Trades — every trade must have year, make, model, acv, exit_strategy
    trades.forEach((t, i) => {
      const label = trades.length > 1 ? ` (trade ${i + 1})` : "";
      if (t.year === null) errs.push(`Trade year is required${label}`);
      if (!t.make?.trim()) errs.push(`Trade make is required${label}`);
      if (!t.model?.trim()) errs.push(`Trade model is required${label}`);
      if (t.acv === null) errs.push(`Trade ACV is required${label}`);
      if (!t.exit_strategy?.trim())
        errs.push(`Trade exit strategy is required${label}`);
    });

    return errs;
  }

  // ── Close Deal handler ────────────────────────────────────────────────────────
  async function handleClose() {
    const errs = validateForClose();
    if (errs.length > 0) {
      setCloseErrors(errs);
      setSaved(false);
      setErrors([]);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setCloseErrors([]);
    setSaved(false);
    setErrors([]);
    setClosing(true);

    try {
      const supabase = createSupabaseBrowserClient();

      // Single update: Step 2 fields + status='closed' in one round trip
      const { error } = await supabase
        .from("deals")
        .update({ ...buildPayload(), status: "closed" })
        .eq("id", dealId);

      if (error) throw new Error(error.message);

      setClosed(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      // Redirect to pending list after a short pause so the banner is readable
      setTimeout(() => router.push("/app/deals"), 2000);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "An unexpected error occurred. Please try again.";
      setCloseErrors([`Close failed: ${msg}`]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setClosing(false);
    }
  }

  const busy = saving || closing || closed;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Page header */}
      <section className="app-panel p-5">
        <p className="app-kicker">Transaction Intake</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
          Update Pending Deal
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Step 2 — Fill economics and close when ready.
        </p>
      </section>

      {/* ── Close success banner ─────────────────────────────────────────────── */}
      {closed && (
        <div className="flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 p-5">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-green-800">Deal closed</p>
            <p className="mt-0.5 text-sm text-green-700">
              Stock{" "}
              <span className="font-mono font-semibold">#{stockNumber}</span> has
              been marked Closed. Redirecting to Pending Deals…
            </p>
            <a
              href="/app/deals"
              className="mt-1 inline-block text-xs text-green-700 underline hover:text-green-900"
            >
              Go to Pending Deals →
            </a>
          </div>
        </div>
      )}

      {/* ── Close validation errors ──────────────────────────────────────────── */}
      {closeErrors.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <div className="mb-2 flex items-center gap-2">
            <XCircle className="h-4 w-4 shrink-0 text-red-600" />
            <p className="text-sm font-semibold text-red-800">
              Cannot close — fix these first:
            </p>
          </div>
          <ul className="list-inside list-disc space-y-0.5 pl-1">
            {closeErrors.map((e, i) => (
              <li key={i} className="text-sm text-red-700">
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Save progress success banner ─────────────────────────────────────── */}
      {saved && (
        <div className="flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 p-5">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-green-800">Progress saved</p>
            <p className="mt-0.5 text-sm text-green-700">
              Deal{" "}
              <span className="font-mono font-semibold">#{stockNumber}</span>{" "}
              updated — status remains Pending.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSaved(false)}
            className="shrink-0 text-xs text-green-600 underline hover:text-green-900"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Save error banner ────────────────────────────────────────────────── */}
      {errors.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <p className="mb-2 text-sm font-semibold text-red-800">Save failed:</p>
          <ul className="list-inside list-disc space-y-0.5">
            {errors.map((e, i) => (
              <li key={i} className="text-sm text-red-700">
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Deal Context (read-only) ─────────────────────────────────────────── */}
      <Card className="app-panel border-[#e7ebf3] shadow-none">
        <CardHeader className="border-[#edf1f7]">
          <CardTitle className="text-lg">Deal Context</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
            <div>
              <p className={LBL}>Stock #</p>
              <p className="mt-0.5 font-mono text-sm font-semibold text-slate-800">
                {stockNumber}
              </p>
            </div>
            <div>
              <p className={LBL}>Customer</p>
              <p className="mt-0.5 text-sm font-medium text-slate-800">
                {customerLastName}
              </p>
            </div>
            <div>
              <p className={LBL}>Vehicle</p>
              <p className="mt-0.5 text-sm text-slate-800">
                {vehicleYear} {vehicleMake} {vehicleModel}
              </p>
            </div>
            <div>
              <p className={LBL}>Store</p>
              <p className="mt-0.5 text-sm text-slate-600">{storeName}</p>
            </div>
            <div>
              <p className={LBL}>Department</p>
              <p className="mt-0.5 text-sm text-slate-600">{departmentName}</p>
            </div>
            <div>
              <p className={LBL}>Salespeople</p>
              <p className="mt-0.5 text-sm text-slate-600">
                {salespeopleCount === 0
                  ? "None assigned"
                  : `${salespeopleCount} · ${Math.round(shareSum * 100)}% allocated`}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Vehicle Details ──────────────────────────────────────────────────── */}
      <Card className="app-panel border-[#e7ebf3] shadow-none">
        <CardHeader className="border-[#edf1f7]">
          <CardTitle className="text-lg">Vehicle Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <label className={LBL}>VIN</label>
              <Input
                value={vin}
                onChange={(e) => setVin(e.target.value)}
                placeholder="1GCUYDED0MZ123456"
                disabled={closed}
              />
            </div>
            <div className="space-y-1">
              <label className={LBL}>Trim</label>
              <Input
                value={trim}
                onChange={(e) => setTrim(e.target.value)}
                placeholder="LT Trail Boss"
                disabled={closed}
              />
            </div>
            <div className="space-y-1">
              <label className={LBL}>Color</label>
              <Input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="Summit White"
                disabled={closed}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <label className={LBL}>Body Style</label>
              <Input
                value={bodyStyle}
                onChange={(e) => setBodyStyle(e.target.value)}
                placeholder="Crew Cab"
                disabled={closed}
              />
            </div>
            <div className="space-y-1">
              <label className={LBL}>Drivetrain</label>
              <Input
                value={drivetrain}
                onChange={(e) => setDrivetrain(e.target.value)}
                placeholder="4WD"
                disabled={closed}
              />
            </div>
            <div className="space-y-1">
              <label className={LBL}>Odometer</label>
              <Input
                type="number"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
                placeholder="12450"
                min={0}
                disabled={closed}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Acquisition & Finance ────────────────────────────────────────────── */}
      <Card className="app-panel border-[#e7ebf3] shadow-none">
        <CardHeader className="border-[#edf1f7]">
          <CardTitle className="text-lg">Acquisition & Finance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {/* Acquisition source — stores the name string, not a uuid */}
            <div className="space-y-1">
              <label className={LBL}>Acquisition Source</label>
              <select
                value={acquisitionSource}
                onChange={(e) => setAcquisitionSource(e.target.value)}
                disabled={closed}
                className={SEL}
              >
                <option value="">
                  {acquisitionSources.length === 0
                    ? "No sources configured"
                    : "None / Unknown"}
                </option>
                {acquisitionSources.map((src) => (
                  <option key={src.id} value={src.name}>
                    {src.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Finance type — lowercase enum stored in DB */}
            <div className="space-y-1">
              <label className={LBL}>Finance Type</label>
              <select
                value={financeType}
                onChange={(e) => setFinanceType(e.target.value)}
                disabled={closed}
                className={SEL}
              >
                <option value="">None</option>
                <option value="prime">Prime</option>
                <option value="subprime">Subprime</option>
                <option value="lease">Lease</option>
                <option value="cash">Cash</option>
              </select>
            </div>

            {/* Finance manager — uuid FK; table is currently empty, handled gracefully */}
            <div className="space-y-1">
              <label className={LBL}>Finance Manager</label>
              <select
                value={financeManagerId}
                onChange={(e) => setFinanceManagerId(e.target.value)}
                disabled={closed || financeManagers.length === 0}
                className={SEL}
              >
                <option value="">
                  {financeManagers.length === 0
                    ? "No finance managers configured yet"
                    : "None"}
                </option>
                {financeManagers.map((fm) => (
                  <option key={fm.id} value={fm.id}>
                    {fm.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Financials ───────────────────────────────────────────────────────── */}
      <Card className="app-panel border-[#e7ebf3] shadow-none">
        <CardHeader className="border-[#edf1f7]">
          <CardTitle className="text-lg">Financials</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <label className={LBL}>Front Gross</label>
              <Input
                type="number"
                value={frontProfit}
                onChange={(e) => setFrontProfit(e.target.value)}
                placeholder="1200"
                disabled={closed}
              />
            </div>
            <div className="space-y-1">
              <label className={LBL}>Back Gross</label>
              <Input
                type="number"
                value={backProfit}
                onChange={(e) => setBackProfit(e.target.value)}
                placeholder="900"
                disabled={closed}
              />
            </div>
            <div className="space-y-1">
              <label className={LBL}>Sale Price</label>
              <Input
                type="number"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                placeholder="52500"
                disabled={closed}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <label className={LBL}>Age (days in stock)</label>
              <Input
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="14"
                min={0}
                disabled={closed}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Action bar ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-3 pb-6">
        <Button
          type="button"
          variant="outline"
          onClick={handleSave}
          disabled={busy}
          className="min-w-[160px]"
        >
          {saving ? "Saving…" : "Save Progress"}
        </Button>
        <Button
          type="button"
          onClick={handleClose}
          disabled={busy}
          className="min-w-[160px] bg-green-700 hover:bg-green-800"
        >
          {closing ? "Closing…" : "Close Deal"}
        </Button>
      </div>
    </div>
  );
}
