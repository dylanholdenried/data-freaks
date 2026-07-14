"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, PlusCircle, Trash2 } from "lucide-react";

type Store = { id: string; name: string };
type Department = { id: string; name: string; store_id: string };
type Salesperson = { id: string; name: string; store_id: string };

interface Props {
  userId: string;
  stores: Store[];
  departments: Department[];
  salespeople: Salesperson[];
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
  share: string; // UI display: "100" = 100%; stored in DB as 1.0
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
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm " +
  "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const LBL = "text-xs font-medium text-slate-500";

export default function NewDealForm({ userId, stores, departments, salespeople }: Props) {
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

  // ── Store change: reset dependent fields ────────────────────────────────────
  function handleStoreChange(id: string) {
    setStoreId(id);
    setDepartmentId("");
    setSplits([{ salesperson_id: "", share: "100" }]);
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

    try {
      const supabase = createSupabaseBrowserClient();

      // 1. Insert deal — only confirmed real columns
      const { data: deal, error: dealError } = await supabase
        .from("deals")
        .insert({
          store_id: storeId,
          department_id: departmentId,
          customer_last_name: customerLastName.trim(),
          sale_date: saleDate,
          stock_number: stockNumber.trim(),
          vehicle_year: parseInt(vehicleYear, 10),
          vehicle_make: vehicleMake.trim(),
          vehicle_model: vehicleModel.trim(),
          status: "pending",
          entered_by: userId,
        })
        .select("id")
        .single();

      if (dealError) throw new Error(`Deal insert failed: ${dealError.message}`);
      const dealId = deal.id;

      // 2. Insert deal_salespeople (share stored as decimal: 100% → 1.0)
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

      // 4. Insert note (deal_notes.note — confirmed column name)
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
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Log Transaction</h1>
        <p className="mt-1 text-sm text-slate-500">Step 1 — Add Deal. Saves as Pending.</p>
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
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <p className="mb-2 text-sm font-semibold text-red-800">
            Please fix the following before saving:
          </p>
          <ul className="list-inside list-disc space-y-0.5">
            {errors.map((e, i) => (
              <li key={i} className="text-sm text-red-700">
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Store & Department ─────────────────────────────────────────────── */}
      <Card className="app-panel border-[#e7ebf3] shadow-none">
        <CardHeader className="border-[#edf1f7]">
          <CardTitle className="text-lg">Store & Department</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className={LBL}>Store *</label>
              <select
                value={storeId}
                onChange={(e) => handleStoreChange(e.target.value)}
                className={SEL}
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
                className={SEL}
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
      <Card className="app-panel border-[#e7ebf3] shadow-none">
        <CardHeader className="border-[#edf1f7]">
          <CardTitle className="text-lg">Deal Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <label className={LBL}>Sale Date *</label>
              <Input
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className={LBL}>Customer Last Name *</label>
              <Input
                value={customerLastName}
                onChange={(e) => setCustomerLastName(e.target.value)}
                placeholder="Smith"
              />
            </div>
            <div className="space-y-1">
              <label className={LBL}>Stock # *</label>
              <Input
                value={stockNumber}
                onChange={(e) => setStockNumber(e.target.value)}
                placeholder="12345"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <label className={LBL}>Year *</label>
              <Input
                type="number"
                value={vehicleYear}
                onChange={(e) => setVehicleYear(e.target.value)}
                placeholder="2024"
                min={1900}
                max={2100}
              />
            </div>
            <div className="space-y-1">
              <label className={LBL}>Make *</label>
              <Input
                value={vehicleMake}
                onChange={(e) => setVehicleMake(e.target.value)}
                placeholder="Chevrolet"
              />
            </div>
            <div className="space-y-1">
              <label className={LBL}>Model *</label>
              <Input
                value={vehicleModel}
                onChange={(e) => setVehicleModel(e.target.value)}
                placeholder="Silverado"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Salesperson(s) ─────────────────────────────────────────────────── */}
      <Card className="app-panel border-[#e7ebf3] shadow-none">
        <CardHeader className="border-[#edf1f7]">
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
                  className={SEL}
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
                    className="pr-7"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
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
                  className="shrink-0 text-slate-400 hover:text-red-500"
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
      <Card className="app-panel border-[#e7ebf3] shadow-none">
        <CardHeader className="border-[#edf1f7]">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Trade-In</CardTitle>
            <label className="flex cursor-pointer items-center gap-2">
              <span className="text-xs text-slate-500">Has trade?</span>
              <button
                type="button"
                role="switch"
                aria-checked={hasTrade}
                onClick={() => setHasTrade((v) => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  hasTrade ? "bg-blue-600" : "bg-slate-200"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg transition-transform ${
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
                className="space-y-3 rounded-xl border border-[#edf1f7] bg-[#fafcff] p-4"
              >
                {trades.length > 1 && (
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Trade {idx + 1}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeTrade(idx)}
                      className="h-7 px-2 text-slate-400 hover:text-red-500"
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
                      placeholder="2020"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={LBL}>Make *</label>
                    <Input
                      value={trade.make}
                      onChange={(e) => updateTrade(idx, "make", e.target.value)}
                      placeholder="Ford"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={LBL}>Model *</label>
                    <Input
                      value={trade.model}
                      onChange={(e) => updateTrade(idx, "model", e.target.value)}
                      placeholder="F-150"
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
                      placeholder="18000"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={LBL}>Allowance</label>
                    <Input
                      type="number"
                      value={trade.allowance}
                      onChange={(e) => updateTrade(idx, "allowance", e.target.value)}
                      placeholder="20000"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={LBL}>Exit Strategy *</label>
                    <select
                      value={trade.exit_strategy}
                      onChange={(e) => updateTrade(idx, "exit_strategy", e.target.value)}
                      className={SEL}
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
      <Card className="app-panel border-[#e7ebf3] shadow-none">
        <CardHeader className="border-[#edf1f7]">
          <CardTitle className="text-lg">Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Optional — handoff context, conditions, manager notes..."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
