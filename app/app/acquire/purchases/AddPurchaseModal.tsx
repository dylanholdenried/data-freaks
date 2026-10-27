"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IC } from "@/lib/inventory-command/midmo";
import {
  ACQ_SOURCE_LABELS,
  ACQ_SOURCE_TYPES,
  ACQ_STAGE_LABELS,
  ACQ_STAGES,
  type AcqBuyer,
  type AcqSourceType,
} from "@/lib/acquire/types";
import {
  createAcquirePurchase,
  findAcquirePurchasesByVin,
  type AcqDuplicateVinMatch,
} from "../actions";
import { decodeVin, VinDecodeError } from "@/lib/vehicle";
import { adoptCatalogVehicle } from "@/lib/vehicle-catalog";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { X, Loader2, AlertTriangle } from "lucide-react";
import AcquireVehicleFields, {
  normalizeDrivetrain,
  type VehicleCatalogMake,
  type VehicleCatalogModel,
} from "./AcquireVehicleFields";

export default function AddPurchaseModal({
  stores,
  buyers,
  vehicleMakes,
  vehicleModels,
  defaultStoreId,
  hidden = false,
  canViewPurchase,
  onViewExisting,
  onClose,
}: {
  stores: { id: string; name: string }[];
  buyers: AcqBuyer[];
  vehicleMakes: VehicleCatalogMake[];
  vehicleModels: VehicleCatalogModel[];
  defaultStoreId: string;
  /** Keeps form state mounted while another overlay (e.g. existing purchase) is shown. */
  hidden?: boolean;
  canViewPurchase?: (purchaseId: string) => boolean;
  onViewExisting?: (purchaseId: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [decoding, setDecoding] = useState(false);
  const [vin, setVin] = useState("");
  const [year, setYear] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [trim, setTrim] = useState("");
  const [color, setColor] = useState("");
  const [bodyStyle, setBodyStyle] = useState("");
  const [drivetrain, setDrivetrain] = useState("");
  const [addedModels, setAddedModels] = useState<VehicleCatalogModel[]>([]);
  const catalogModels = [...vehicleModels, ...addedModels];
  const [duplicates, setDuplicates] = useState<AcqDuplicateVinMatch[] | null>(null);
  const [duplicateVin, setDuplicateVin] = useState("");
  const [acknowledgedVin, setAcknowledgedVin] = useState<string | null>(null);
  const pendingSubmitRef = useRef<FormData | null>(null);
  const lastCheckedVinRef = useRef<string | null>(null);

  const storeNameById = Object.fromEntries(stores.map((s) => [s.id, s.name]));

  async function checkDuplicateVin(v: string) {
    if (v.length !== 17 || v === acknowledgedVin || v === lastCheckedVinRef.current) return;
    lastCheckedVinRef.current = v;
    const res = await findAcquirePurchasesByVin(v);
    if (res.ok && res.matches.length) {
      pendingSubmitRef.current = null;
      setDuplicateVin(v);
      setDuplicates(res.matches);
    }
  }

  function confirmDuplicate() {
    setAcknowledgedVin(duplicateVin);
    setDuplicates(null);
    const fd = pendingSubmitRef.current;
    pendingSubmitRef.current = null;
    if (fd) {
      fd.set("allow_duplicate_vin", "true");
      submitPurchase(fd);
    }
  }

  function rejectDuplicate() {
    setDuplicates(null);
    pendingSubmitRef.current = null;
    lastCheckedVinRef.current = null;
    setAcknowledgedVin(null);
    setVin("");
  }

  async function handleDecode() {
    const v = vin.trim().toUpperCase();
    if (v.length !== 17) {
      setError("VIN must be 17 characters to decode.");
      return;
    }
    setDecoding(true);
    setError(null);
    try {
      const d = await decodeVin(v);
      const applied = await adoptCatalogVehicle(
        createSupabaseBrowserClient(),
        d.make,
        d.model,
        vehicleMakes,
        catalogModels,
        d.trim
      );
      if (applied.added) {
        setAddedModels((prev) =>
          prev.some((model) => model.id === applied.added!.id)
            ? prev
            : [...prev, applied.added!]
        );
      }
      if (d.year != null) setYear(String(d.year));
      setMake(applied.makeName);
      setModel(applied.modelName);
      if (d.trim) setTrim(d.trim);
      if (d.bodyStyle) setBodyStyle(d.bodyStyle);
      if (d.drivetrain) setDrivetrain(normalizeDrivetrain(d.drivetrain));
    } catch (e) {
      setError(e instanceof VinDecodeError ? e.message : "VIN decode failed");
    } finally {
      setDecoding(false);
    }
  }

  function submitPurchase(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createAcquirePurchase(fd);
      if (!res.ok) {
        if (res.duplicateVin?.length) {
          pendingSubmitRef.current = fd;
          setDuplicateVin(String(fd.get("vin") ?? ""));
          setDuplicates(res.duplicateVin);
        } else {
          setError(res.error);
        }
      } else {
        router.refresh();
        onClose();
      }
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const v = vin.trim().toUpperCase();
    fd.set("vin", v);
    fd.set("vehicle_year", year);
    fd.set("vehicle_make", make);
    fd.set("vehicle_model", model);
    fd.set("vehicle_trim", trim);
    fd.set("color", color);
    fd.set("body_style", bodyStyle);
    fd.set("drivetrain", drivetrain);
    fd.set("allow_duplicate_vin", v && v === acknowledgedVin ? "true" : "");
    submitPurchase(fd);
  }

  const inputStyle = {
    background: "#0f141c",
    borderColor: IC.border,
    color: IC.text,
  } as const;

  const activeBuyers = buyers.filter((b) => b.active);

  return (
    <div
      className={`fixed inset-0 z-50 items-center justify-center p-4 ${hidden ? "hidden" : "flex"}`}
      role="dialog"
      aria-modal="true"
    >
      <button type="button" className="absolute inset-0 bg-black/60" aria-label="Close" onClick={onClose} />
      <div
        className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-xl border p-4 shadow-2xl"
        style={{ background: IC.panel, borderColor: IC.border, color: IC.text }}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide">Log purchase</h2>
          <button type="button" onClick={onClose} className="rounded p-1 hover:bg-white/5" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-xs" style={{ color: IC.muted }}>
          All fields optional. Leave dealership blank if the destination store is still TBD.
          Make/model/color/body/drivetrain use the same lists as Sales Registry.
        </p>
        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block text-xs">
            <span style={{ color: IC.muted }}>Dealership</span>
            <select
              name="store_id"
              defaultValue=""
              className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
              style={inputStyle}
            >
              <option value="">— Unassigned —</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs">
            <span style={{ color: IC.muted }}>Buyer</span>
            <select name="buyer_id" defaultValue="" className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm" style={inputStyle}>
              <option value="">—</option>
              {activeBuyers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs">
              <span style={{ color: IC.muted }}>Stock</span>
              <input name="stock_number" className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm" style={inputStyle} />
            </label>
            <label className="block text-xs">
              <span style={{ color: IC.muted }}>VIN</span>
              <div className="mt-1 flex gap-1">
                <input
                  value={vin}
                  onChange={(e) => setVin(e.target.value.toUpperCase())}
                  onBlur={() => {
                    const v = vin.trim().toUpperCase();
                    if (v.length === 17) {
                      void handleDecode();
                      void checkDuplicateVin(v);
                    }
                  }}
                  maxLength={17}
                  className="w-full rounded-md border px-2 py-1.5 text-sm uppercase"
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => void handleDecode()}
                  disabled={decoding}
                  className="shrink-0 rounded-md border px-2 text-[10px] font-semibold"
                  style={{ borderColor: IC.border, color: IC.blue }}
                >
                  {decoding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Decode"}
                </button>
              </div>
              {acknowledgedVin && acknowledgedVin === vin.trim().toUpperCase() ? (
                <span className="mt-1 block text-[10px]" style={{ color: IC.yellow }}>
                  Duplicate VIN — override approved
                </span>
              ) : null}
            </label>
          </div>

          <AcquireVehicleFields
            vehicleMakes={vehicleMakes}
            vehicleModels={catalogModels}
            canEdit
            compact
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

          <label className="block text-xs">
            <span style={{ color: IC.muted }}>Purchase source</span>
            <select
              name="source_type"
              defaultValue={"auction" satisfies AcqSourceType}
              className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
              style={inputStyle}
            >
              {ACQ_SOURCE_TYPES.map((s) => (
                <option key={s} value={s}>
                  {ACQ_SOURCE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs">
            <span style={{ color: IC.muted }}>Auction house / seller</span>
            <input name="seller_name" className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm" style={inputStyle} />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs">
              <span style={{ color: IC.muted }}>Purchase date</span>
              <input name="purchase_date" type="date" className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm" style={inputStyle} />
            </label>
            <label className="block text-xs">
              <span style={{ color: IC.muted }}>Status</span>
              <select name="stage" defaultValue="awaiting_bos" className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm" style={inputStyle}>
                {ACQ_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {ACQ_STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm" style={{ color: IC.text }}>
            <input type="checkbox" name="on_hold" value="true" className="h-4 w-4 rounded border" />
            On Hold
            <span className="text-xs" style={{ color: IC.muted }}>
              (title / office — not a status)
            </span>
          </label>

          <label className="flex items-center gap-2 text-sm" style={{ color: IC.text }}>
            <input
              type="checkbox"
              name="transport_scheduled"
              value="true"
              className="h-4 w-4 rounded border"
            />
            Transport scheduled
            <span className="text-xs" style={{ color: IC.muted }}>
              (broker / carrier booked)
            </span>
          </label>

          {error ? (
            <p className="text-xs" style={{ color: IC.red }}>
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border px-3 py-2 text-xs font-semibold"
              style={{ borderColor: IC.border, color: IC.muted }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
              style={{ background: IC.blue }}
            >
              {pending ? "Saving…" : "Add to collection"}
            </button>
          </div>
        </form>
      </div>

      {duplicates ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-4" role="alertdialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" aria-hidden />
          <div
            className="relative w-full max-w-md rounded-xl border p-4 shadow-2xl"
            style={{ background: IC.panel, borderColor: IC.yellow, color: IC.text }}
          >
            <div className="mb-2 flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: IC.yellow }} />
              <div>
                <h3 className="text-sm font-bold">
                  This VIN already exists as a purchase. Would you like to add it again?
                </h3>
                <p className="mt-1 font-mono text-xs" style={{ color: IC.muted }}>
                  {duplicateVin}
                </p>
              </div>
            </div>

            <ul className="mb-4 space-y-2">
              {duplicates.map((d) => {
                const ymm = [d.vehicle_year, d.vehicle_make, d.vehicle_model, d.vehicle_trim]
                  .filter((x) => x != null && String(x).trim() !== "")
                  .join(" ");
                const storeLabel = d.store_id
                  ? storeNameById[d.store_id] ?? "Another store"
                  : "Unassigned";
                const viewable = onViewExisting && (canViewPurchase?.(d.id) ?? true);
                return (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                    style={{ borderColor: IC.border, background: IC.rowAlt }}
                  >
                    <div className="min-w-0 text-xs">
                      <p className="truncate font-semibold">{ymm || "Vehicle"}</p>
                      <p className="truncate font-mono text-[11px]" style={{ color: IC.muted }}>
                        {d.vin}
                      </p>
                      <p className="truncate" style={{ color: IC.muted }}>
                        {[
                          d.stock_number ? `Stock ${d.stock_number}` : "No stock #",
                          storeLabel,
                          ACQ_STAGE_LABELS[d.stage] ?? d.stage,
                          d.purchase_date ? `Bought ${d.purchase_date}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {viewable ? (
                      <button
                        type="button"
                        onClick={() => onViewExisting(d.id)}
                        className="shrink-0 rounded-md border px-2 py-1 text-[11px] font-semibold"
                        style={{ borderColor: IC.border, color: IC.blue }}
                      >
                        View
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={rejectDuplicate}
                disabled={pending}
                className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-60"
                style={{ borderColor: IC.border, color: IC.muted }}
              >
                No
              </button>
              <button
                type="button"
                onClick={confirmDuplicate}
                disabled={pending}
                className="rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-60"
                style={{ background: IC.yellow, color: "#111" }}
              >
                Yes, add again
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
