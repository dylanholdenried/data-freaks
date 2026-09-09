"use client";

import { useState, useTransition } from "react";
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
import { createAcquirePurchase } from "../actions";
import { decodeVin, VinDecodeError } from "@/lib/vehicle";
import { X, Loader2 } from "lucide-react";
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
  onClose,
}: {
  stores: { id: string; name: string }[];
  buyers: AcqBuyer[];
  vehicleMakes: VehicleCatalogMake[];
  vehicleModels: VehicleCatalogModel[];
  defaultStoreId: string;
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
      if (d.year != null) setYear(String(d.year));
      if (d.make) setMake(d.make);
      if (d.model) setModel(d.model);
      if (d.trim) setTrim(d.trim);
      if (d.bodyStyle) setBodyStyle(d.bodyStyle);
      if (d.drivetrain) setDrivetrain(normalizeDrivetrain(d.drivetrain));
    } catch (e) {
      setError(e instanceof VinDecodeError ? e.message : "VIN decode failed");
    } finally {
      setDecoding(false);
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("vin", vin.trim().toUpperCase());
    fd.set("vehicle_year", year);
    fd.set("vehicle_make", make);
    fd.set("vehicle_model", model);
    fd.set("vehicle_trim", trim);
    fd.set("color", color);
    fd.set("body_style", bodyStyle);
    fd.set("drivetrain", drivetrain);
    setError(null);
    startTransition(async () => {
      const res = await createAcquirePurchase(fd);
      if (!res.ok) setError(res.error);
      else {
        router.refresh();
        onClose();
      }
    });
  }

  const inputStyle = {
    background: "#0f141c",
    borderColor: IC.border,
    color: IC.text,
  } as const;

  const activeBuyers = buyers.filter((b) => b.active);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
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
                    if (vin.trim().length === 17) void handleDecode();
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
            </label>
          </div>

          <AcquireVehicleFields
            vehicleMakes={vehicleMakes}
            vehicleModels={vehicleModels}
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
    </div>
  );
}
