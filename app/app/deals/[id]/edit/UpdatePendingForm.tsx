"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Info, Loader2, PlusCircle, Trash2, XCircle } from "lucide-react";
import { COLORS, BODY_STYLES, DRIVETRAINS, decodeVin, VinDecodeError } from "@/lib/vehicle";
import { canClose } from "@/lib/can-close";
import {
  classifyStockMatches,
  findStockMatches,
  findVinMatches,
  isUniqueViolation,
  type DealMatch,
} from "@/lib/deals/duplicate-checks";
import type { DealEventRow } from "@/lib/deals/deal-events";
import { reopenDeal } from "@/app/app/deals/actions";
import { cn } from "@/lib/utils";
import DealAuditLog from "./DealAuditLog";

type TradeRow = {
  id: string;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  acv: number | null;
  allowance: number | null;
  exit_strategy: string | null;
};

type EditableTrade = {
  clientKey: string;
  id: string | null;
  vin: string;
  year: string;
  make: string;
  model: string;
  makeId: string;
  modelId: string;
  makeIsManual: boolean;
  modelIsManual: boolean;
  acv: string;
  allowance: string;
  exit_strategy: string;
};

type Split = {
  salesperson_id: string;
  share: string; // UI display: "100" = 100%; stored in DB as whole number
};

interface Props {
  // Identifiers
  dealId: string;
  dealStatus: string;
  canReopen: boolean;
  events: DealEventRow[];
  // Step 1 fields — editable until closed
  stockNumber: string;
  customerLastName: string;
  initialSaleDate: string;
  initialDepartmentId: string;
  departments: { id: string; name: string }[];
  // Read-only context
  vehicleYear: number;
  vehicleMake: string;
  vehicleModel: string;
  storeId: string;
  storeName: string;
  // Step 2 fields (null = not yet entered)
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
  initialListPrice: number | null;
  initialListPriceNa: boolean;
  initialAge: number | null;
  // Dropdown options
  acquisitionSources: { id: string; name: string }[];
  financeManagers: { id: string; name: string }[];
  vehicleMakes: { id: string; name: string }[];
  vehicleModels: { id: string; name: string; make_id: string }[];
  departmentMakes: { department_id: string; make: string }[];
  salespeople: { id: string; name: string }[];
  initialSplits: { salesperson_id: string; share_percent: number }[];
  trades: TradeRow[];
}

// Mirrors the Input component's border/focus styling so selects are consistent
const SEL =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground " +
  "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const LBL = "text-xs font-medium text-muted-foreground";

function emptyCls(value: string, locked = false) {
  return !locked && !value.trim()
    ? "border-red-400 bg-[color-mix(in_srgb,var(--da-red)_12%,transparent)] focus-visible:ring-red-400 focus:ring-red-400"
    : "";
}

function numStr(v: number | null): string {
  return v !== null ? String(v) : "";
}

function emptyEditableTrade(): EditableTrade {
  return {
    clientKey: `new-${crypto.randomUUID()}`,
    id: null,
    vin: "",
    year: "",
    make: "",
    model: "",
    makeId: "",
    modelId: "",
    makeIsManual: false,
    modelIsManual: false,
    acv: "",
    allowance: "",
    exit_strategy: "",
  };
}

function resolveTradeMakeModel(
  make: string,
  model: string,
  vehicleMakes: { id: string; name: string }[],
  vehicleModels: { id: string; name: string; make_id: string }[]
) {
  const matchedMake = vehicleMakes.find(
    (m) => m.name.toLowerCase() === make.toLowerCase()
  );
  const makeId = matchedMake?.id ?? "";
  const makeIsManual = Boolean(make) && !matchedMake;
  const matchedModel = matchedMake
    ? vehicleModels.find(
        (m) =>
          m.make_id === matchedMake.id &&
          m.name.toLowerCase() === model.toLowerCase()
      )
    : undefined;
  return {
    makeId,
    makeIsManual,
    modelId: matchedModel?.id ?? "",
    modelIsManual: Boolean(model) && !matchedModel,
  };
}

function toEditableTrade(
  t: TradeRow,
  vehicleMakes: { id: string; name: string }[],
  vehicleModels: { id: string; name: string; make_id: string }[]
): EditableTrade {
  const make = t.make ?? "";
  const model = t.model ?? "";
  return {
    clientKey: t.id,
    id: t.id,
    vin: t.vin ?? "",
    year: numStr(t.year),
    make,
    model,
    ...resolveTradeMakeModel(make, model, vehicleMakes, vehicleModels),
    acv: numStr(t.acv),
    allowance: numStr(t.allowance),
    exit_strategy: t.exit_strategy ?? "",
  };
}


function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    delivered: "bg-blue-100 text-blue-700",
    closed: "bg-emerald-100 text-emerald-700",
    dead: "bg-muted text-muted-foreground",
    unwound: "bg-red-100 text-[var(--da-red)]",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
        cfg[status] ?? "bg-muted text-muted-foreground"
      }`}
    >
      {status}
    </span>
  );
}

export default function UpdatePendingForm({
  dealId,
  dealStatus: initialDealStatus,
  canReopen,
  events,
  // Destructure with "initial" aliases so state can own the canonical names
  stockNumber: initialStockNumber,
  customerLastName: initialCustomerLastName,
  initialSaleDate,
  initialDepartmentId,
  departments,
  vehicleYear,
  vehicleMake,
  vehicleModel,
  storeId,
  storeName,
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
  initialListPrice,
  initialListPriceNa,
  initialAge,
  acquisitionSources,
  financeManagers,
  vehicleMakes,
  vehicleModels,
  departmentMakes,
  salespeople,
  initialSplits,
  trades: initialTrades,
}: Props) {
  const router = useRouter();
  const [dealStatus, setDealStatus] = useState(initialDealStatus);

  useEffect(() => {
    setDealStatus(initialDealStatus);
  }, [initialDealStatus]);

  // ── Step 1 editable state ─────────────────────────────────────────────────────
  const [stockNumber, setStockNumber] = useState(initialStockNumber);
  const [stockBlockingMatch, setStockBlockingMatch] = useState<DealMatch | null>(null);
  const [stockReuseMatch, setStockReuseMatch] = useState<DealMatch | null>(null);
  const [vinMatch, setVinMatch] = useState<DealMatch | null>(null);
  const [checkingStock, setCheckingStock] = useState(false);
  const [customerLastName, setCustomerLastName] = useState(initialCustomerLastName);
  const [saleDate, setSaleDate] = useState(initialSaleDate ?? "");
  const [departmentId, setDepartmentId] = useState(initialDepartmentId ?? "");

  // ── Salesperson splits ────────────────────────────────────────────────────────
  const [splits, setSplits] = useState<Split[]>(() => {
    if (initialSplits.length === 0) {
      return [{ salesperson_id: "", share: "100" }];
    }
    return initialSplits.map((s) => ({
      salesperson_id: s.salesperson_id,
      share: String(s.share_percent ?? 100),
    }));
  });

  // ── Trades (editable) ─────────────────────────────────────────────────────────
  const [persistedTradeIds, setPersistedTradeIds] = useState(() =>
    initialTrades.map((t) => t.id)
  );
  const [tradeRows, setTradeRows] = useState<EditableTrade[]>(() =>
    initialTrades.map((t) => toEditableTrade(t, vehicleMakes, vehicleModels))
  );
  const [tradeDecodingKey, setTradeDecodingKey] = useState<string | null>(null);
  const [tradeDecodeErrors, setTradeDecodeErrors] = useState<Record<string, string>>({});
  const [tradeDecoded, setTradeDecoded] = useState<Record<string, boolean>>({});

  // ── Decoded vehicle identity (saved via buildPayload) ─────────────────────────
  const [displayYear, setDisplayYear] = useState<number>(vehicleYear);
  const [displayMake, setDisplayMake] = useState(vehicleMake);
  const [displayModel, setDisplayModel] = useState(vehicleModel);

  // ── Make/Model dropdown IDs + manual-override flags ───────────────────────────
  const [makeId, setMakeId] = useState<string>(() => {
    const found = vehicleMakes.find(
      (m) => m.name.toLowerCase() === vehicleMake.toLowerCase()
    );
    return found?.id ?? "";
  });
  const [makeIsManual, setMakeIsManual] = useState<boolean>(() => {
    if (!vehicleMake) return false;
    return !vehicleMakes.some(
      (m) => m.name.toLowerCase() === vehicleMake.toLowerCase()
    );
  });
  const [modelId, setModelId] = useState<string>(() => {
    const mk = vehicleMakes.find(
      (m) => m.name.toLowerCase() === vehicleMake.toLowerCase()
    );
    if (!mk) return "";
    const found = vehicleModels.find(
      (m) =>
        m.make_id === mk.id &&
        m.name.toLowerCase() === vehicleModel.toLowerCase()
    );
    return found?.id ?? "";
  });
  const [modelIsManual, setModelIsManual] = useState<boolean>(() => {
    if (!vehicleModel) return false;
    const mk = vehicleMakes.find(
      (m) => m.name.toLowerCase() === vehicleMake.toLowerCase()
    );
    if (!mk) return !!vehicleModel;
    return !vehicleModels.some(
      (m) =>
        m.make_id === mk.id &&
        m.name.toLowerCase() === vehicleModel.toLowerCase()
    );
  });

  // ── VIN decode state ──────────────────────────────────────────────────────────
  const [decoding, setDecoding] = useState(false);
  const [decodeMsg, setDecodeMsg] = useState<string | null>(null);
  const [decodeError, setDecodeError] = useState<string | null>(null);

  // ── Step 2 editable state ─────────────────────────────────────────────────────
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
  const [listPriceNa, setListPriceNa] = useState(initialListPriceNa);
  const [listPrice, setListPrice] = useState(
    initialListPriceNa ? "" : numStr(initialListPrice)
  );
  const [age, setAge] = useState(numStr(initialAge));

  // ── UI state ──────────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [closing, setClosing] = useState(false);
  const [closeErrors, setCloseErrors] = useState<string[]>([]);
  const [closed, setClosed] = useState(false);

  // ── Duplicate lookups ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!storeId || !stockNumber.trim()) {
      setStockBlockingMatch(null);
      setStockReuseMatch(null);
      setCheckingStock(false);
      return;
    }

    let cancelled = false;
    setCheckingStock(true);
    const timer = window.setTimeout(async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const matches = await findStockMatches(supabase, {
          storeId,
          stockNumber,
          excludeDealId: dealId,
        });
        if (cancelled) return;
        const { blockingMatch, reuseMatch } = classifyStockMatches(matches);
        setStockBlockingMatch(blockingMatch);
        setStockReuseMatch(reuseMatch);
      } catch {
        if (!cancelled) {
          setStockBlockingMatch(null);
          setStockReuseMatch(null);
        }
      } finally {
        if (!cancelled) setCheckingStock(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [storeId, stockNumber, dealId]);

  useEffect(() => {
    if (!storeId || vin.trim().length !== 17) {
      setVinMatch(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const matches = await findVinMatches(supabase, {
          storeId,
          vin,
          excludeDealId: dealId,
        });
        if (cancelled) return;
        setVinMatch(matches[0] ?? null);
      } catch {
        if (!cancelled) setVinMatch(null);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [storeId, vin, dealId]);
  const [showLostConfirm, setShowLostConfirm] = useState(false);
  const [markingLost, setMarkingLost] = useState(false);
  const [markedLost, setMarkedLost] = useState(false);
  const [showDeliveredConfirm, setShowDeliveredConfirm] = useState(false);
  const [markingDelivered, setMarkingDelivered] = useState(false);
  const [markedDelivered, setMarkedDelivered] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);

  // ── VIN Decoder ───────────────────────────────────────────────────────────────
  async function handleDecodeVin() {
    const v = vin.trim();
    if (v.length !== 17) return;

    setDecoding(true);
    setDecodeMsg(null);
    setDecodeError(null);

    try {
      const decoded = await decodeVin(v);

      if (decoded.year !== null) setDisplayYear(decoded.year);

      const matchedMake = vehicleMakes.find(
        (m) => m.name.toLowerCase() === decoded.make.toLowerCase()
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
      setDisplayMake(decoded.make);

      const matchedModel = vehicleModels.find(
        (m) =>
          m.make_id === resolvedMakeId &&
          m.name.toLowerCase() === decoded.model.toLowerCase()
      );
      if (matchedModel) {
        setModelId(matchedModel.id);
        setModelIsManual(false);
      } else {
        setModelId("");
        setModelIsManual(true);
      }
      setDisplayModel(decoded.model);

      setTrim(decoded.trim);
      if (decoded.bodyStyle) setBodyStyle(decoded.bodyStyle);
      if (decoded.drivetrain) setDrivetrain(decoded.drivetrain);

      const summaryYear = decoded.year ?? displayYear;
      const summaryParts = [decoded.bodyStyle, decoded.drivetrain].filter(Boolean).join(" · ");
      setDecodeMsg(
        `Decoded from VIN: ${summaryYear} ${decoded.make} ${decoded.model}${
          summaryParts ? " · " + summaryParts : ""
        }`
      );
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

  // ── Salesperson split helpers ─────────────────────────────────────────────────
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

  async function saveSalespeople(
    supabase: ReturnType<typeof createSupabaseBrowserClient>
  ) {
    const { error: delError } = await supabase
      .from("deal_salespeople")
      .delete()
      .eq("deal_id", dealId);
    if (delError) throw new Error(`Salespeople update failed: ${delError.message}`);

    const activeSplits = splits.filter((s) => s.salesperson_id);
    if (activeSplits.length === 0) return;

    const { error: spError } = await supabase.from("deal_salespeople").insert(
      activeSplits.map((s) => ({
        deal_id: dealId,
        salesperson_id: s.salesperson_id,
        share_percent: parseFloat(s.share) || 0,
      }))
    );
    if (spError) throw new Error(`Salespeople update failed: ${spError.message}`);
  }

  function tradePayload(t: EditableTrade) {
    return {
      vin: t.vin.trim() || null,
      year: t.year.trim() ? parseInt(t.year, 10) : null,
      make: t.make.trim() || null,
      model: t.model.trim() || null,
      acv: t.acv.trim() ? parseFloat(t.acv) : null,
      allowance: t.allowance.trim() ? parseFloat(t.allowance) : null,
      exit_strategy: t.exit_strategy || null,
    };
  }

  async function saveTrades(
    supabase: ReturnType<typeof createSupabaseBrowserClient>
  ) {
    const currentIds = tradeRows
      .map((t) => t.id)
      .filter((id): id is string => Boolean(id));
    const toDelete = persistedTradeIds.filter((id) => !currentIds.includes(id));

    if (toDelete.length > 0) {
      const { error: delError } = await supabase
        .from("trades")
        .delete()
        .in("id", toDelete);
      if (delError) throw new Error(`Trade delete failed: ${delError.message}`);
    }

    const nextRows: EditableTrade[] = [];
    for (const t of tradeRows) {
      const payload = tradePayload(t);
      if (t.id) {
        const { error } = await supabase
          .from("trades")
          .update(payload)
          .eq("id", t.id);
        if (error) throw new Error(`Trade update failed: ${error.message}`);
        nextRows.push(t);
      } else {
        const { data, error } = await supabase
          .from("trades")
          .insert({ deal_id: dealId, ...payload })
          .select("id")
          .single();
        if (error) throw new Error(`Trade insert failed: ${error.message}`);
        nextRows.push({ ...t, id: data.id, clientKey: data.id });
      }
    }
    setTradeRows(nextRows);
    setPersistedTradeIds(
      nextRows.map((t) => t.id).filter((id): id is string => Boolean(id))
    );
  }

  // ── Trade helpers ─────────────────────────────────────────────────────────────
  function addTrade() {
    setTradeRows((prev) => [...prev, emptyEditableTrade()]);
  }

  function removeTrade(clientKey: string) {
    setTradeRows((prev) => prev.filter((t) => t.clientKey !== clientKey));
    setTradeDecodeErrors((prev) => {
      const next = { ...prev };
      delete next[clientKey];
      return next;
    });
    setTradeDecoded((prev) => {
      const next = { ...prev };
      delete next[clientKey];
      return next;
    });
  }

  function updateTrade(
    clientKey: string,
    field: keyof EditableTrade,
    value: string
  ) {
    setTradeRows((prev) =>
      prev.map((t) => (t.clientKey === clientKey ? { ...t, [field]: value } : t))
    );
  }

  function patchTrade(clientKey: string, patch: Partial<EditableTrade>) {
    setTradeRows((prev) =>
      prev.map((t) => (t.clientKey === clientKey ? { ...t, ...patch } : t))
    );
  }

  async function handleDecodeTradeVin(clientKey: string) {
    const trade = tradeRows.find((t) => t.clientKey === clientKey);
    const v = trade?.vin.trim() ?? "";
    if (v.length !== 17) return;

    setTradeDecodingKey(clientKey);
    setTradeDecodeErrors((prev) => {
      const next = { ...prev };
      delete next[clientKey];
      return next;
    });

    try {
      const d = await decodeVin(v);
      const matchedMake = vehicleMakes.find(
        (m) => m.name.toLowerCase() === d.make.toLowerCase()
      );
      const resolvedMakeId = matchedMake?.id ?? "";
      const makeIsManual = !matchedMake;
      const matchedModel = vehicleModels.find(
        (m) =>
          m.make_id === resolvedMakeId &&
          m.name.toLowerCase() === d.model.toLowerCase()
      );

      setTradeRows((prev) =>
        prev.map((t) =>
          t.clientKey === clientKey
            ? {
                ...t,
                year: d.year !== null ? String(d.year) : t.year,
                make: d.make || t.make,
                model: d.model || t.model,
                makeId: resolvedMakeId,
                makeIsManual,
                modelId: matchedModel?.id ?? "",
                modelIsManual: !matchedModel,
              }
            : t
        )
      );
      setTradeDecoded((prev) => ({ ...prev, [clientKey]: true }));
    } catch (err) {
      const msg =
        err instanceof VinDecodeError
          ? err.message
          : "Could not decode this VIN — enter details manually.";
      setTradeDecodeErrors((prev) => ({ ...prev, [clientKey]: msg }));
    } finally {
      setTradeDecodingKey(null);
    }
  }

  // ── Payload builder ───────────────────────────────────────────────────────────
  function buildPayload() {
    return {
      // Step 1 fields
      sale_date: saleDate || null,
      stock_number: stockNumber.trim() || null,
      customer_last_name: customerLastName.trim() || null,
      department_id: departmentId || null,
      // Vehicle identity (updated by decode or Make/Model dropdowns)
      vehicle_year: displayYear,
      vehicle_make: displayMake || null,
      vehicle_model: displayModel || null,
      // Step 2 fields
      vin: vin.trim() || null,
      trim: trim.trim() || null,
      color: color || null,
      body_style: bodyStyle || null,
      drivetrain: drivetrain || null,
      odometer: odometer.trim() ? parseInt(odometer, 10) : null,
      acquisition_source: acquisitionSource || null,
      finance_type: financeType || null,
      finance_manager_id: financeManagerId || null,
      front_profit: frontProfit.trim() !== "" ? parseFloat(frontProfit) : null,
      back_profit: backProfit.trim() !== "" ? parseFloat(backProfit) : null,
      sale_price: salePrice.trim() !== "" ? parseFloat(salePrice) : null,
      list_price_na: listPriceNa,
      list_price: listPriceNa
        ? null
        : listPrice.trim() !== ""
          ? parseFloat(listPrice)
          : null,
      age: age.trim() ? parseInt(age, 10) : null,
      trade_status: tradeRows.length > 0 ? "has_trade" : "no_trade",
    };
  }

  // ── Save Progress ─────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setErrors([]);
    setCloseErrors([]);

    try {
      if (stockBlockingMatch) {
        throw new Error("Duplicate Stock Number Found");
      }

      const supabase = createSupabaseBrowserClient();

      const latestMatches = await findStockMatches(supabase, {
        storeId,
        stockNumber,
        excludeDealId: dealId,
      });
      const { blockingMatch } = classifyStockMatches(latestMatches);
      if (blockingMatch) {
        setStockBlockingMatch(blockingMatch);
        setStockReuseMatch(null);
        throw new Error("Duplicate Stock Number Found");
      }

      const { error } = await supabase
        .from("deals")
        .update(buildPayload())
        .eq("id", dealId);

      if (error) {
        if (isUniqueViolation(error.message)) {
          throw new Error("Duplicate Stock Number Found");
        }
        throw new Error(error.message);
      }
      await saveSalespeople(supabase);
      await saveTrades(supabase);

      if (vinMatch) {
        await ensureOpenFlag(
          "duplicate_vin",
          `VIN matches deal ${vinMatch.id} (stock ${vinMatch.stock_number}, status ${vinMatch.status})`
        );
      }

      setSaved(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "An unexpected error occurred. Please try again.";
      setErrors([msg]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(false);
    }
  }

  // ── Close gate validation ─────────────────────────────────────────────────────
  function validateForClose(): string[] {
    const errs: string[] = [];

    // Step 1 fields
    if (!saleDate) errs.push("Sale date is required");
    if (!stockNumber.trim()) errs.push("Stock number is required");
    if (!customerLastName.trim()) errs.push("Customer last name is required");
    if (!departmentId) errs.push("Department is required");

    // Vehicle identity
    if (!displayYear) errs.push("Vehicle year is required");
    if (!displayMake.trim()) errs.push("Vehicle make is required");
    if (!displayModel.trim()) errs.push("Vehicle model is required");

    // Step 2 — vehicle details (VIN owned by canClose)
    if (!trim.trim()) errs.push("Trim is required");
    if (!color) errs.push("Color is required");
    if (!bodyStyle) errs.push("Body style is required");
    if (!drivetrain) errs.push("Drivetrain is required");
    if (!odometer.trim()) errs.push("Odometer is required");

    // Acquisition & finance (finance manager owned by canClose)
    if (!acquisitionSource) errs.push("Acquisition source is required");
    if (!financeType) errs.push("Finance type is required");

    // Financials — 0 is valid, blank is not
    if (frontProfit.trim() === "")
      errs.push("Front gross is required (enter 0 if zero)");
    if (backProfit.trim() === "")
      errs.push("Back gross is required (enter 0 if zero)");
    if (!salePrice.trim()) errs.push("Sale price is required");
    if (listPriceNa) {
      // NA voids lost gross — allowed
    } else if (!listPrice.trim()) {
      errs.push("List price is required (enter a number or select NA)");
    } else if (!Number.isFinite(parseFloat(listPrice))) {
      errs.push("List price must be a number");
    }
    if (!age.trim()) errs.push("Age is required");

    // Salespeople
    const activeSplits = splits.filter((s) => s.salesperson_id);
    if (activeSplits.length < 1) {
      errs.push("At least one salesperson is required");
    } else {
      const shareTotal = activeSplits.reduce(
        (sum, s) => sum + (parseFloat(s.share) || 0),
        0
      );
      if (Math.abs(shareTotal - 100) >= 0.1) {
        errs.push(
          `Salesperson splits must total 100% (currently ${Math.round(shareTotal)}%)`
        );
      }
    }

    // Trades
    tradeRows.forEach((t, i) => {
      const label = tradeRows.length > 1 ? ` (trade ${i + 1})` : "";
      if (!t.year.trim()) errs.push(`Trade year is required${label}`);
      if (!t.make.trim()) errs.push(`Trade make is required${label}`);
      if (!t.model.trim()) errs.push(`Trade model is required${label}`);
      if (!t.vin.trim()) errs.push(`Trade VIN is required${label}`);
      if (!t.acv.trim()) errs.push(`Trade ACV is required${label}`);
      if (!t.allowance.trim()) errs.push(`Trade allowance is required${label}`);
      if (!t.exit_strategy.trim())
        errs.push(`Trade exit strategy is required${label}`);
    });

    return errs;
  }

  async function ensureOpenFlag(
    flagType: "no_vin_at_close" | "make_dept_mismatch" | "duplicate_vin",
    detail: string
  ) {
    const supabase = createSupabaseBrowserClient();
    const { data: existing } = await supabase
      .from("deal_flags")
      .select("id")
      .eq("deal_id", dealId)
      .eq("flag_type", flagType)
      .is("resolved_at", null)
      .limit(1);

    if (existing && existing.length > 0) return;

    const { error } = await supabase.from("deal_flags").insert({
      deal_id: dealId,
      flag_type: flagType,
      detail,
    });
    if (error) throw new Error(`Deal flag insert failed: ${error.message}`);
  }

  // ── Close Deal ────────────────────────────────────────────────────────────────
  async function handleClose() {
    const fieldErrs = validateForClose();
    const gate = canClose({
      vin,
      vehicleMake: displayMake,
      departmentId,
      departmentMakes,
      financeManagerId,
    });
    const errs = [...fieldErrs, ...gate.reasons];

    if (errs.length > 0) {
      setCloseErrors(errs);
      setSaved(false);
      setErrors([]);
      window.scrollTo({ top: 0, behavior: "smooth" });

      // Accountability flags only when canClose accountability rules failed
      try {
        if (!vin.trim()) {
          await ensureOpenFlag("no_vin_at_close", "VIN missing at close attempt");
        }
        if (
          displayMake.trim() &&
          departmentId &&
          gate.reasons.includes("Make is not valid for this department")
        ) {
          await ensureOpenFlag(
            "make_dept_mismatch",
            `${displayMake.trim()} not allowed for department`
          );
        }
      } catch (flagErr: unknown) {
        const msg =
          flagErr instanceof Error ? flagErr.message : "Could not record close flag.";
        setCloseErrors([...errs, msg]);
      }
      return;
    }

    setCloseErrors([]);
    setSaved(false);
    setErrors([]);
    setClosing(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("deals")
        .update({ ...buildPayload(), status: "closed" })
        .eq("id", dealId);

      if (error) throw new Error(error.message);
      await saveSalespeople(supabase);
      await saveTrades(supabase);
      setDealStatus("closed");
      setClosed(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => router.push("/app/deals"), 2000);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "An unexpected error occurred. Please try again.";
      setCloseErrors([`Close failed: ${msg}`]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setClosing(false);
    }
  }

  // ── Mark Lost (status: dead) ──────────────────────────────────────────────────
  async function handleMarkLost() {
    setShowLostConfirm(false);
    setMarkingLost(true);
    setSaved(false);
    setErrors([]);
    setCloseErrors([]);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("deals")
        .update({ ...buildPayload(), status: "dead" })
        .eq("id", dealId);

      if (error) throw new Error(error.message);
      await saveSalespeople(supabase);
      await saveTrades(supabase);
      setDealStatus("dead");
      setMarkedLost(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => router.push("/app/deals"), 2000);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "An unexpected error occurred. Please try again.";
      setErrors([`Mark lost failed: ${msg}`]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setMarkingLost(false);
    }
  }

  // ── Mark Delivered ────────────────────────────────────────────────────────────
  async function handleMarkDelivered() {
    setShowDeliveredConfirm(false);
    setMarkingDelivered(true);
    setSaved(false);
    setErrors([]);
    setCloseErrors([]);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("deals")
        .update({ ...buildPayload(), status: "delivered" })
        .eq("id", dealId);

      if (error) throw new Error(error.message);
      await saveSalespeople(supabase);
      await saveTrades(supabase);
      setDealStatus("delivered");
      setMarkedDelivered(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => router.push("/app/deals"), 2000);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "An unexpected error occurred. Please try again.";
      setErrors([`Mark delivered failed: ${msg}`]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setMarkingDelivered(false);
    }
  }

  async function handleReopen(targetStatus: "pending" | "delivered") {
    setReopening(true);
    setReopenError(null);
    try {
      const result = await reopenDeal(dealId, targetStatus);
      if (!result.ok) {
        setReopenError(result.error);
        return;
      }
      setDealStatus(result.status);
      setClosed(false);
      setMarkedLost(false);
      setMarkedDelivered(result.status === "delivered");
      setShowReopenModal(false);
      router.refresh();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      setReopenError(msg);
    } finally {
      setReopening(false);
    }
  }

  // closed/unwound/dead deals are read-only until reopened.
  const isLocked =
    dealStatus === "closed" ||
    dealStatus === "unwound" ||
    dealStatus === "dead" ||
    closed ||
    markedLost;

  const busy =
    saving ||
    closing ||
    closed ||
    markingLost ||
    markedLost ||
    markingDelivered ||
    markedDelivered ||
    reopening ||
    !!stockBlockingMatch ||
    checkingStock;

  const alreadyDelivered = dealStatus === "delivered" || markedDelivered;

  function renderActionButtons() {
    return (
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={handleSave}
          disabled={busy}
          className="min-w-[140px]"
        >
          {saving ? "Saving…" : "Save Progress"}
        </Button>
        <Button
          type="button"
          onClick={handleClose}
          disabled={busy}
          className="min-w-[140px] bg-green-700 hover:bg-green-800"
        >
          {closing ? "Closing…" : "Close Deal"}
        </Button>
        {!alreadyDelivered && (
          <Button
            type="button"
            onClick={() => setShowDeliveredConfirm(true)}
            disabled={busy}
            className="min-w-[140px] bg-blue-600 hover:bg-blue-700"
          >
            {markingDelivered ? "Marking…" : "Mark Delivered"}
          </Button>
        )}
        <Button
          type="button"
          onClick={() => setShowLostConfirm(true)}
          disabled={busy}
          className="min-w-[140px] bg-red-600 hover:bg-red-700"
        >
          {markingLost ? "Marking…" : "Mark Lost"}
        </Button>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Page header */}
      <section className="app-panel p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="app-kicker">Transaction Intake</p>
            <div className="mt-1 flex items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                Update Deal
              </h1>
              <StatusBadge
                status={
                  markedLost ? "dead" : markedDelivered ? "delivered" : dealStatus
                }
              />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Fill economics and close when ready.
            </p>
          </div>
          {!isLocked && renderActionButtons()}
          {isLocked && canReopen && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setReopenError(null);
                setShowReopenModal(true);
              }}
              className="shrink-0"
            >
              Re-Open Deal
            </Button>
          )}
        </div>
      </section>

      {/* ── Close success banner ─────────────────────────────────────────────── */}
      {closed && (
        <div className="flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 p-5">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-green-800">Deal closed</p>
            <p className="mt-0.5 text-sm text-green-700">
              Stock{" "}
              <span className="font-mono font-semibold">#{stockNumber}</span>{" "}
              has been marked Closed. Redirecting to Sales Registry…
            </p>
            <a
              href="/app/deals"
              className="mt-1 inline-block text-xs text-green-700 underline hover:text-green-900"
            >
              Go to Sales Registry →
            </a>
          </div>
        </div>
      )}

      {/* ── Mark delivered success banner ────────────────────────────────────── */}
      {markedDelivered && (
        <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-blue-800">Deal marked delivered</p>
            <p className="mt-0.5 text-sm text-blue-700">
              Stock{" "}
              <span className="font-mono font-semibold">#{stockNumber}</span>{" "}
              has been marked Delivered. Redirecting to Sales Registry…
            </p>
            <a
              href="/app/deals"
              className="mt-1 inline-block text-xs text-blue-700 underline hover:text-blue-900"
            >
              Go to Sales Registry →
            </a>
          </div>
        </div>
      )}

      {/* ── Mark lost success banner ─────────────────────────────────────────── */}
      {markedLost && (
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted p-5">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">Deal marked lost</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Stock{" "}
              <span className="font-mono font-semibold">#{stockNumber}</span>{" "}
              has been marked Lost. Redirecting to Sales Registry…
            </p>
            <a
              href="/app/deals"
              className="mt-1 inline-block text-xs text-muted-foreground underline hover:text-foreground"
            >
              Go to Sales Registry →
            </a>
          </div>
        </div>
      )}

      {/* ── Close validation errors ──────────────────────────────────────────── */}
      {closeErrors.length > 0 && (
        <div className="rounded-2xl border border-[color-mix(in_srgb,var(--da-red)_35%,transparent)] bg-[color-mix(in_srgb,var(--da-red)_12%,transparent)] p-5">
          <div className="mb-2 flex items-center gap-2">
            <XCircle className="h-4 w-4 shrink-0 text-red-600" />
            <p className="text-sm font-semibold text-[var(--da-red)]">
              Cannot close — fix these first:
            </p>
          </div>
          <ul className="list-inside list-disc space-y-0.5 pl-1">
            {closeErrors.map((e, i) => (
              <li key={i} className="text-sm text-[var(--da-red)]">
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
              updated successfully.
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
        <div className="rounded-2xl border border-[color-mix(in_srgb,var(--da-red)_35%,transparent)] bg-[color-mix(in_srgb,var(--da-red)_12%,transparent)] p-5">
          <p className="mb-2 text-sm font-semibold text-[var(--da-red)]">Save failed:</p>
          <ul className="list-inside list-disc space-y-0.5">
            {errors.map((e, i) => (
              <li key={i} className="text-sm text-[var(--da-red)]">
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      {vinMatch && (
        <div className="rounded-2xl border border-[color-mix(in_srgb,var(--da-amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--da-amber)_12%,transparent)] p-5">
          <p className="text-sm font-semibold text-amber-900">Possible duplicate VIN</p>
          <p className="mt-1 text-sm text-amber-800">
            This VIN is already on stock{" "}
            <span className="font-mono font-semibold">#{vinMatch.stock_number}</span> (
            {vinMatch.status}
            {vinMatch.customer_last_name ? ` · ${vinMatch.customer_last_name}` : ""}). You can
            still save; this deal will be flagged.
          </p>
          <Link
            href={`/app/deals/${vinMatch.id}/edit`}
            className="mt-2 inline-block text-sm font-medium text-amber-900 underline underline-offset-2"
          >
            View matching deal
          </Link>
        </div>
      )}

      {/* ── Deal Details (Step 1 — editable until closed) ────────────────────── */}
      <Card className="app-panel border-border shadow-none">
        <CardHeader className="border-border">
          <CardTitle className="text-lg">Deal Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Row 1: Sale Date | Customer Last Name | Stock # */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <label className={LBL}>Sale Date</label>
              <Input
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                disabled={isLocked}
                className={emptyCls(saleDate, isLocked)}
              />
            </div>
            <div className="space-y-1">
              <label className={LBL}>Customer Last Name</label>
              <Input
                value={customerLastName}
                onChange={(e) => setCustomerLastName(e.target.value)}
                disabled={isLocked}
                className={emptyCls(customerLastName, isLocked)}
              />
            </div>
            <div className="space-y-1">
              <label className={LBL}>Stock #</label>
              <Input
                value={stockNumber}
                onChange={(e) => setStockNumber(e.target.value)}
                disabled={isLocked}
                className={cn(
                  emptyCls(stockNumber, isLocked),
                  stockBlockingMatch &&
                    "border-[var(--da-red)] bg-[color-mix(in_srgb,var(--da-red)_12%,transparent)] focus-visible:ring-[var(--da-red)]"
                )}
                aria-invalid={!!stockBlockingMatch}
              />
              {checkingStock && (
                <p className="text-xs text-muted-foreground">Checking stock number…</p>
              )}
            </div>
          </div>

          {stockBlockingMatch && (
            <div className="rounded-xl border border-[color-mix(in_srgb,var(--da-red)_35%,transparent)] bg-[color-mix(in_srgb,var(--da-red)_12%,transparent)] px-4 py-3">
              <p className="text-sm font-semibold text-[var(--da-red)]">
                Duplicate Stock Number Found
              </p>
              <p className="mt-1 text-sm text-[var(--da-red)]">
                Stock{" "}
                <span className="font-mono font-semibold">#{stockBlockingMatch.stock_number}</span>{" "}
                is already on a {stockBlockingMatch.status} deal
                {stockBlockingMatch.customer_last_name
                  ? ` for ${stockBlockingMatch.customer_last_name}`
                  : ""}
                . Saving is blocked so this deal is not double-logged.
              </p>
              <Link
                href={`/app/deals/${stockBlockingMatch.id}/edit`}
                className="mt-2 inline-block text-sm font-medium text-[var(--da-red)] underline underline-offset-2"
              >
                View existing deal
              </Link>
            </div>
          )}

          {!stockBlockingMatch && stockReuseMatch && (
            <div className="rounded-xl border border-[color-mix(in_srgb,var(--da-amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--da-amber)_12%,transparent)] px-4 py-3">
              <p className="text-sm font-semibold text-amber-900">Stock number previously used</p>
              <p className="mt-1 text-sm text-amber-800">
                Stock{" "}
                <span className="font-mono font-semibold">#{stockReuseMatch.stock_number}</span> was
                used on a {stockReuseMatch.status} deal. You can still save.
              </p>
              <Link
                href={`/app/deals/${stockReuseMatch.id}/edit`}
                className="mt-2 inline-block text-sm font-medium text-amber-900 underline underline-offset-2"
              >
                View previous deal
              </Link>
            </div>
          )}

          {/* Row 2: Department | Store (read-only) | Vehicle (read-only computed) */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <label className={LBL}>Department</label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                disabled={isLocked}
                className={cn(SEL, emptyCls(departmentId, isLocked))}
              >
                <option value="">Select department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className={LBL}>Store</label>
              <p className="flex h-10 items-center text-sm text-muted-foreground">
                {storeName}
              </p>
            </div>
            <div className="space-y-1">
              <label className={LBL}>Vehicle</label>
              <p className="flex h-10 items-center text-sm text-muted-foreground">
                {displayYear} {displayMake} {displayModel}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Salesperson(s) ───────────────────────────────────────────────────── */}
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
                  disabled={isLocked}
                  className={cn(SEL, emptyCls(split.salesperson_id, isLocked))}
                >
                  <option value="">
                    {salespeople.length === 0
                      ? "No active salespeople for this store"
                      : "Select salesperson"}
                  </option>
                  {salespeople.map((sp) => (
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
                    disabled={isLocked}
                    className={cn("pr-7", emptyCls(split.share, isLocked))}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    %
                  </span>
                </div>
              </div>
              {splits.length > 1 && !isLocked && (
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

          {!isLocked && splits.length < 2 && salespeople.length > 1 && (
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

      {/* ── VIN decode success banner ─────────────────────────────────────────── */}
      {decodeMsg && (
        <div className="flex items-start gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--da-blue)_35%,transparent)] bg-[color-mix(in_srgb,var(--da-blue)_12%,transparent)] p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <p className="flex-1 text-sm text-blue-800">{decodeMsg}</p>
          <button
            type="button"
            onClick={() => setDecodeMsg(null)}
            className="shrink-0 text-xs text-blue-600 underline hover:text-blue-900"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── VIN decode error banner ───────────────────────────────────────────── */}
      {decodeError && (
        <div className="flex items-start gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--da-amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--da-amber)_12%,transparent)] p-4">
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

      {/* ── Vehicle Details ──────────────────────────────────────────────────── */}
      <Card className="app-panel border-border shadow-none">
        <CardHeader className="border-border">
          <CardTitle className="text-lg">Vehicle Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Row 1: VIN (2 cols + Decode button) | Trim */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1 sm:col-span-2">
              <label className={LBL}>VIN</label>
              <div className="flex gap-2">
                <Input
                  value={vin}
                  onChange={(e) => {
                    setVin(e.target.value);
                    setDecodeMsg(null);
                    setDecodeError(null);
                  }}
                  onBlur={() => {
                    if (vin.trim().length === 17) handleDecodeVin();
                  }}
                  disabled={isLocked || decoding}
                  className={`font-mono ${emptyCls(vin, isLocked)}`}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDecodeVin}
                  disabled={vin.trim().length !== 17 || decoding || isLocked}
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
            <div className="space-y-1">
              <label className={LBL}>Trim</label>
              <Input
                value={trim}
                onChange={(e) => setTrim(e.target.value)}
                disabled={isLocked}
                className={emptyCls(trim, isLocked)}
              />
            </div>
          </div>

          {/* Row 2: Make | Model | Odometer */}
          <div className="grid gap-4 sm:grid-cols-3">

            {/* Make */}
            <div className="space-y-1">
              <label className={LBL}>Make</label>
              {makeIsManual ? (
                <>
                  <Input
                    value={displayMake}
                    onChange={(e) => setDisplayMake(e.target.value)}
                    disabled={isLocked}
                    className={emptyCls(displayMake, isLocked)}
                  />
                  <p className="text-xs text-amber-600">
                    ⚠ Not in vehicle list — verify or ask an admin to add it
                  </p>
                </>
              ) : (
                <select
                  value={makeId}
                  onChange={(e) => {
                    const id = e.target.value;
                    const found = vehicleMakes.find((m) => m.id === id);
                    setMakeId(id);
                    setDisplayMake(found?.name ?? "");
                    setModelId("");
                    setDisplayModel("");
                    setModelIsManual(false);
                  }}
                  disabled={isLocked}
                  className={cn(SEL, emptyCls(makeId, isLocked))}
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
              <label className={LBL}>Model</label>
              {makeIsManual || modelIsManual ? (
                <>
                  <Input
                    value={displayModel}
                    onChange={(e) => setDisplayModel(e.target.value)}
                    disabled={isLocked}
                    className={emptyCls(displayModel, isLocked)}
                  />
                  {modelIsManual && !makeIsManual && (
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
                    setDisplayModel(found?.name ?? "");
                  }}
                  disabled={isLocked || !makeId}
                  className={cn(SEL, emptyCls(modelId, isLocked))}
                >
                  <option value="">
                    {makeId ? "Select model" : "Select make first"}
                  </option>
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

            {/* Odometer */}
            <div className="space-y-1">
              <label className={LBL}>Odometer</label>
              <Input
                type="number"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
                min={0}
                disabled={isLocked}
                className={emptyCls(odometer, isLocked)}
              />
            </div>
          </div>

          {/* Row 3: Color | Body Style | Drivetrain */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <label className={LBL}>Color</label>
              <select
                value={color}
                onChange={(e) => setColor(e.target.value)}
                disabled={isLocked}
                className={cn(SEL, emptyCls(color, isLocked))}
              >
                <option value="">Select color</option>
                {COLORS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className={LBL}>Body Style</label>
              <select
                value={bodyStyle}
                onChange={(e) => setBodyStyle(e.target.value)}
                disabled={isLocked}
                className={cn(SEL, emptyCls(bodyStyle, isLocked))}
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
                disabled={isLocked}
                className={cn(SEL, emptyCls(drivetrain, isLocked))}
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

      {/* ── Acquisition & Finance ────────────────────────────────────────────── */}
      <Card className="app-panel border-border shadow-none">
        <CardHeader className="border-border">
          <CardTitle className="text-lg">Acquisition & Finance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <label className={LBL}>Acquisition Source</label>
              <select
                value={acquisitionSource}
                onChange={(e) => setAcquisitionSource(e.target.value)}
                disabled={isLocked}
                className={cn(SEL, emptyCls(acquisitionSource, isLocked))}
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
            <div className="space-y-1">
              <label className={LBL}>Finance Type</label>
              <select
                value={financeType}
                onChange={(e) => setFinanceType(e.target.value)}
                disabled={isLocked}
                className={cn(SEL, emptyCls(financeType, isLocked))}
              >
                <option value="">None</option>
                <option value="prime">Prime</option>
                <option value="subprime">Subprime</option>
                <option value="lease">Lease</option>
                <option value="cash">Cash</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className={LBL}>Finance Manager</label>
              <select
                value={financeManagerId}
                onChange={(e) => setFinanceManagerId(e.target.value)}
                disabled={isLocked || financeManagers.length === 0}
                className={cn(SEL, emptyCls(financeManagerId, isLocked))}
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

      {/* ── Trade-In ─────────────────────────────────────────────────────────── */}
      <Card className="app-panel border-border shadow-none">
        <CardHeader className="border-border">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-lg">Trade-In</CardTitle>
            {!isLocked && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addTrade}
                disabled={busy}
              >
                <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
                {tradeRows.length === 0 ? "Add trade" : "Add another trade"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {tradeRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No trade-in on this deal.</p>
          ) : (
            tradeRows.map((trade, idx) => (
              <div
                key={trade.clientKey}
                className="space-y-3 rounded-xl border border-border bg-muted p-4"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Trade {idx + 1}
                  </p>
                  {!isLocked && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeTrade(trade.clientKey)}
                      className="h-7 px-2 text-muted-foreground hover:text-red-500"
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Remove
                    </Button>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1 sm:col-span-2">
                    <label className={LBL}>VIN</label>
                    <div className="flex gap-2">
                      <Input
                        value={trade.vin}
                        onChange={(e) => {
                          updateTrade(trade.clientKey, "vin", e.target.value);
                          setTradeDecodeErrors((prev) => {
                            const next = { ...prev };
                            delete next[trade.clientKey];
                            return next;
                          });
                          setTradeDecoded((prev) => {
                            const next = { ...prev };
                            delete next[trade.clientKey];
                            return next;
                          });
                        }}
                        onBlur={() => {
                          if (trade.vin.trim().length === 17) {
                            handleDecodeTradeVin(trade.clientKey);
                          }
                        }}
                        disabled={isLocked || tradeDecodingKey === trade.clientKey}
                        className={cn(
                          "font-mono",
                          emptyCls(trade.vin, isLocked)
                        )}
                      />
                      {!isLocked && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleDecodeTradeVin(trade.clientKey)}
                          disabled={
                            trade.vin.trim().length !== 17 ||
                            tradeDecodingKey === trade.clientKey
                          }
                          className="shrink-0"
                        >
                          {tradeDecodingKey === trade.clientKey ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Decode VIN"
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {tradeDecoded[trade.clientKey] && !isLocked && (
                  <p className="text-sm text-green-700">
                    ✓ Decoded from VIN —{" "}
                    <button
                      type="button"
                      onClick={() =>
                        setTradeDecoded((prev) => {
                          const next = { ...prev };
                          delete next[trade.clientKey];
                          return next;
                        })
                      }
                      className="text-xs text-green-600 underline hover:text-green-900"
                    >
                      Edit manually
                    </button>
                  </p>
                )}

                {tradeDecodeErrors[trade.clientKey] && (
                  <div className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--da-amber)_35%,transparent)] bg-[color-mix(in_srgb,var(--da-amber)_12%,transparent)] p-3">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <p className="flex-1 text-sm text-amber-800">
                      {tradeDecodeErrors[trade.clientKey]}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setTradeDecodeErrors((prev) => {
                          const next = { ...prev };
                          delete next[trade.clientKey];
                          return next;
                        })
                      }
                      className="shrink-0 text-xs text-amber-600 underline hover:text-amber-900"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <label className={LBL}>Year</label>
                    <Input
                      type="number"
                      value={trade.year}
                      onChange={(e) =>
                        updateTrade(trade.clientKey, "year", e.target.value)
                      }
                      disabled={isLocked || tradeDecoded[trade.clientKey]}
                      className={emptyCls(trade.year, isLocked)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={LBL}>Make</label>
                    {trade.makeIsManual ? (
                      <>
                        <Input
                          value={trade.make}
                          onChange={(e) =>
                            updateTrade(trade.clientKey, "make", e.target.value)
                          }
                          disabled={isLocked || tradeDecoded[trade.clientKey]}
                          className={emptyCls(trade.make, isLocked)}
                        />
                        {!isLocked && !tradeDecoded[trade.clientKey] && (
                          <p className="text-xs text-amber-600">
                            ⚠ Not in vehicle list — verify or ask an admin to add it
                          </p>
                        )}
                      </>
                    ) : (
                      <select
                        value={trade.makeId}
                        onChange={(e) => {
                          const id = e.target.value;
                          const found = vehicleMakes.find((m) => m.id === id);
                          patchTrade(trade.clientKey, {
                            makeId: id,
                            make: found?.name ?? "",
                            modelId: "",
                            model: "",
                            modelIsManual: false,
                          });
                        }}
                        disabled={isLocked || tradeDecoded[trade.clientKey]}
                        className={cn(SEL, emptyCls(trade.makeId, isLocked))}
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
                  <div className="space-y-1">
                    <label className={LBL}>Model</label>
                    {trade.makeIsManual || trade.modelIsManual ? (
                      <>
                        <Input
                          value={trade.model}
                          onChange={(e) =>
                            updateTrade(trade.clientKey, "model", e.target.value)
                          }
                          disabled={isLocked || tradeDecoded[trade.clientKey]}
                          className={emptyCls(trade.model, isLocked)}
                        />
                        {trade.modelIsManual &&
                          !trade.makeIsManual &&
                          !isLocked &&
                          !tradeDecoded[trade.clientKey] && (
                            <p className="text-xs text-amber-600">
                              ⚠ Not in vehicle list — verify or ask an admin to add it
                            </p>
                          )}
                      </>
                    ) : (
                      <select
                        value={trade.modelId}
                        onChange={(e) => {
                          const id = e.target.value;
                          const found = vehicleModels.find((m) => m.id === id);
                          patchTrade(trade.clientKey, {
                            modelId: id,
                            model: found?.name ?? "",
                          });
                        }}
                        disabled={
                          isLocked ||
                          tradeDecoded[trade.clientKey] ||
                          !trade.makeId
                        }
                        className={cn(SEL, emptyCls(trade.modelId, isLocked))}
                      >
                        <option value="">
                          {trade.makeId ? "Select model" : "Select make first"}
                        </option>
                        {vehicleModels
                          .filter((m) => m.make_id === trade.makeId)
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                      </select>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <label className={LBL}>ACV</label>
                    <Input
                      type="number"
                      value={trade.acv}
                      onChange={(e) =>
                        updateTrade(trade.clientKey, "acv", e.target.value)
                      }
                      disabled={isLocked}
                      className={emptyCls(trade.acv, isLocked)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={LBL}>Allowance</label>
                    <Input
                      type="number"
                      value={trade.allowance}
                      onChange={(e) =>
                        updateTrade(trade.clientKey, "allowance", e.target.value)
                      }
                      disabled={isLocked}
                      className={emptyCls(trade.allowance, isLocked)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={LBL}>Exit Strategy</label>
                    <select
                      value={trade.exit_strategy}
                      onChange={(e) =>
                        updateTrade(
                          trade.clientKey,
                          "exit_strategy",
                          e.target.value
                        )
                      }
                      disabled={isLocked}
                      className={cn(SEL, emptyCls(trade.exit_strategy, isLocked))}
                    >
                      <option value="">Select...</option>
                      <option value="retail">Retail</option>
                      <option value="wholesale">Wholesale</option>
                      <option value="unknown">Unknown</option>
                    </select>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* ── Financials ───────────────────────────────────────────────────────── */}
      <Card className="app-panel border-border shadow-none">
        <CardHeader className="border-border">
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
                disabled={isLocked}
                className={emptyCls(frontProfit, isLocked)}
              />
            </div>
            <div className="space-y-1">
              <label className={LBL}>Back Gross</label>
              <Input
                type="number"
                value={backProfit}
                onChange={(e) => setBackProfit(e.target.value)}
                disabled={isLocked}
                className={emptyCls(backProfit, isLocked)}
              />
            </div>
            <div className="space-y-1">
              <label className={LBL}>Sale Price</label>
              <Input
                type="number"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                disabled={isLocked}
                className={emptyCls(salePrice, isLocked)}
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1 sm:col-span-2">
              <label className={LBL}>List Price</label>
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  type="number"
                  value={listPrice}
                  onChange={(e) => {
                    setListPrice(e.target.value);
                    if (e.target.value.trim()) setListPriceNa(false);
                  }}
                  disabled={isLocked || listPriceNa}
                  className={cn(
                    "max-w-xs",
                    listPriceNa ? "" : emptyCls(listPrice, isLocked)
                  )}
                  placeholder={listPriceNa ? "NA" : undefined}
                />
                <label className="inline-flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={listPriceNa}
                    disabled={isLocked}
                    onChange={(e) => {
                      const na = e.target.checked;
                      setListPriceNa(na);
                      if (na) setListPrice("");
                    }}
                    className="h-4 w-4 rounded border-border"
                  />
                  NA (unavailable — voids lost gross)
                </label>
              </div>
            </div>
            <div className="space-y-1">
              <label className={LBL}>Age (days in stock)</label>
              <Input
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                min={0}
                disabled={isLocked}
                className={emptyCls(age, isLocked)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Action bar ───────────────────────────────────────────────────────── */}
      {!isLocked && (
        <div className="pb-6">
          {renderActionButtons()}
        </div>
      )}

      {/* ── Mark Lost confirmation ───────────────────────────────────────────── */}
      {showLostConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="app-panel w-full max-w-md p-6">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Are you sure you want to mark this deal lost?
            </h2>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={markingLost}
                onClick={() => setShowLostConfirm(false)}
              >
                No, Go Back
              </Button>
              <Button
                type="button"
                disabled={markingLost}
                onClick={handleMarkLost}
                className="bg-red-600 hover:bg-red-700"
              >
                {markingLost ? "Marking…" : "Yes, Mark Lost"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mark Delivered confirmation ──────────────────────────────────────── */}
      {showDeliveredConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="app-panel w-full max-w-md p-6">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Would you like to mark{" "}
              <span className="font-mono">{stockNumber || "—"}</span> Delivered?
            </h2>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                disabled={markingDelivered}
                onClick={() => setShowDeliveredConfirm(false)}
                className="bg-red-600 hover:bg-red-700"
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={markingDelivered}
                onClick={handleMarkDelivered}
                className="bg-green-600 hover:bg-green-700"
              >
                {markingDelivered ? "Marking…" : "Yes"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Re-Open Deal ─────────────────────────────────────────────────────── */}
      {showReopenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div
            className="app-panel w-full max-w-md p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reopen-deal-title"
          >
            <h2
              id="reopen-deal-title"
              className="text-lg font-semibold tracking-tight text-foreground"
            >
              Choose Deal Status
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Reopen this deal as Pending or Delivered so you can edit and close
              it again.
            </p>
            {reopenError && (
              <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {reopenError}
              </p>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={reopening}
                onClick={() => {
                  setShowReopenModal(false);
                  setReopenError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={reopening}
                onClick={() => handleReopen("pending")}
              >
                {reopening ? "Updating…" : "Pending"}
              </Button>
              <Button
                type="button"
                disabled={reopening}
                onClick={() => handleReopen("delivered")}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {reopening ? "Updating…" : "Delivered"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <DealAuditLog events={events} />
    </div>
  );
}
