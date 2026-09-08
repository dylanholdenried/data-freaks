"use client";

/**
 * Acquire vehicle identity fields aligned with Sales Registry:
 * catalog make/model + COLORS / BODY_STYLES / DRIVETRAINS from lib/vehicle.
 */

import { useEffect, useMemo, useState } from "react";
import { IC } from "@/lib/inventory-command/midmo";
import { BODY_STYLES, COLORS, DRIVETRAINS } from "@/lib/vehicle";

export type VehicleCatalogMake = { id: string; name: string };
export type VehicleCatalogModel = { id: string; name: string; make_id: string };

const inputStyle = {
  background: "#0f141c",
  borderColor: IC.border,
  color: IC.text,
} as const;

const readOnlyStyle = {
  background: IC.rowAlt,
  borderColor: IC.border,
  color: IC.text,
  opacity: 0.85,
} as const;

export function resolveCatalogMakeId(
  makeName: string,
  makes: VehicleCatalogMake[]
): string {
  const needle = makeName.trim().toLowerCase();
  if (!needle) return "";
  return makes.find((m) => m.name.trim().toLowerCase() === needle)?.id ?? "";
}

export function resolveCatalogModelId(
  modelName: string,
  makeId: string,
  models: VehicleCatalogModel[]
): string {
  const needle = modelName.trim().toLowerCase();
  if (!needle || !makeId) return "";
  return (
    models.find(
      (m) => m.make_id === makeId && m.name.trim().toLowerCase() === needle
    )?.id ?? ""
  );
}

/** Normalize drivetrain from VIN decode into DRIVETRAINS list. */
export function normalizeDrivetrain(raw: string): string {
  const s = raw.trim().toUpperCase();
  if (!s) return "";
  if ((DRIVETRAINS as readonly string[]).includes(s)) return s;
  if (s.includes("4WD") || s.includes("4X4") || s.includes("FOUR")) return "4WD";
  if (s.includes("AWD") || s.includes("ALL")) return "AWD";
  if (s.includes("RWD") || s.includes("REAR")) return "RWD";
  if (s.includes("FWD") || s.includes("FRONT")) return "FWD";
  const first = s.split(/[\s/,]+/)[0] ?? "";
  return (DRIVETRAINS as readonly string[]).includes(first) ? first : "";
}

type Props = {
  vehicleMakes: VehicleCatalogMake[];
  vehicleModels: VehicleCatalogModel[];
  canEdit: boolean;
  year: string;
  make: string;
  model: string;
  trim: string;
  color: string;
  bodyStyle: string;
  drivetrain: string;
  onYearChange: (v: string) => void;
  onMakeChange: (v: string) => void;
  onModelChange: (v: string) => void;
  onTrimChange: (v: string) => void;
  onColorChange: (v: string) => void;
  onBodyStyleChange: (v: string) => void;
  onDrivetrainChange: (v: string) => void;
  /** Field keys that are missing action items (red highlight). */
  alertKeys?: ReadonlySet<string>;
  compact?: boolean;
};

export default function AcquireVehicleFields({
  vehicleMakes,
  vehicleModels,
  canEdit,
  year,
  make,
  model,
  trim,
  color,
  bodyStyle,
  drivetrain,
  onYearChange,
  onMakeChange,
  onModelChange,
  onTrimChange,
  onColorChange,
  onBodyStyleChange,
  onDrivetrainChange,
  alertKeys,
  compact = false,
}: Props) {
  const matchedMakeId = useMemo(
    () => resolveCatalogMakeId(make, vehicleMakes),
    [make, vehicleMakes]
  );
  const [makeId, setMakeId] = useState(matchedMakeId);
  const [makeIsManual, setMakeIsManual] = useState(
    Boolean(make.trim()) && !matchedMakeId
  );

  const effectiveMakeId = makeId || matchedMakeId;

  const modelsForMake = useMemo(
    () => vehicleModels.filter((m) => m.make_id === effectiveMakeId),
    [vehicleModels, effectiveMakeId]
  );

  const matchedModelId = useMemo(
    () => resolveCatalogModelId(model, effectiveMakeId, vehicleModels),
    [model, effectiveMakeId, vehicleModels]
  );
  const [modelId, setModelId] = useState(matchedModelId);
  const [modelIsManual, setModelIsManual] = useState(
    Boolean(model.trim()) && !matchedModelId
  );

  useEffect(() => {
    if (matchedMakeId) {
      setMakeId(matchedMakeId);
      setMakeIsManual(false);
    } else if (make.trim()) {
      setMakeIsManual(true);
      setMakeId("");
    }
  }, [make, matchedMakeId]);

  useEffect(() => {
    if (matchedModelId) {
      setModelId(matchedModelId);
      setModelIsManual(false);
    } else if (model.trim() && effectiveMakeId) {
      setModelIsManual(true);
      setModelId("");
    }
  }, [model, matchedModelId, effectiveMakeId]);

  const style = canEdit ? inputStyle : readOnlyStyle;
  const grid = compact ? "grid grid-cols-2 gap-2" : "grid grid-cols-2 gap-3";
  const alert = (key: string) => Boolean(alertKeys?.has(key));
  const fieldStyle = (key: string) =>
    alert(key) ? { ...style, borderColor: IC.red } : style;
  const labelColor = (key: string) => (alert(key) ? IC.red : IC.muted);

  return (
    <div className={grid}>
      <label className="block text-xs">
        <span style={{ color: labelColor("vehicle_year") }}>Year</span>
        <input
          name="vehicle_year"
          type="number"
          value={year}
          readOnly={!canEdit}
          onChange={(e) => onYearChange(e.target.value)}
          className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
          style={fieldStyle("vehicle_year")}
        />
      </label>

      <label className="block text-xs">
        <span style={{ color: labelColor("vehicle_make") }}>Make</span>
        {makeIsManual ? (
          <input
            name="vehicle_make"
            value={make}
            readOnly={!canEdit}
            onChange={(e) => onMakeChange(e.target.value)}
            className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
            style={fieldStyle("vehicle_make")}
          />
        ) : (
          <select
            name="vehicle_make"
            value={makeId}
            disabled={!canEdit}
            onChange={(e) => {
              const id = e.target.value;
              setMakeId(id);
              setMakeIsManual(false);
              setModelId("");
              setModelIsManual(false);
              const found = vehicleMakes.find((m) => m.id === id);
              onMakeChange(found?.name ?? "");
              onModelChange("");
            }}
            className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
            style={fieldStyle("vehicle_make")}
          >
            <option value="">—</option>
            {vehicleMakes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
        {canEdit && !makeIsManual ? (
          <button
            type="button"
            className="mt-1 text-[10px] font-semibold"
            style={{ color: IC.blue }}
            onClick={() => {
              setMakeIsManual(true);
              setMakeId("");
            }}
          >
            Enter make manually
          </button>
        ) : null}
        {canEdit && makeIsManual ? (
          <button
            type="button"
            className="mt-1 text-[10px] font-semibold"
            style={{ color: IC.blue }}
            onClick={() => {
              setMakeIsManual(false);
              const id = resolveCatalogMakeId(make, vehicleMakes);
              setMakeId(id);
              if (id) {
                const found = vehicleMakes.find((m) => m.id === id);
                if (found) onMakeChange(found.name);
              }
            }}
          >
            Use make list
          </button>
        ) : null}
      </label>

      <label className="block text-xs">
        <span style={{ color: labelColor("vehicle_model") }}>Model</span>
        {modelIsManual || makeIsManual ? (
          <input
            name="vehicle_model"
            value={model}
            readOnly={!canEdit}
            onChange={(e) => onModelChange(e.target.value)}
            className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
            style={fieldStyle("vehicle_model")}
          />
        ) : (
          <select
            name="vehicle_model"
            value={modelId}
            disabled={!canEdit || !effectiveMakeId}
            onChange={(e) => {
              const id = e.target.value;
              setModelId(id);
              setModelIsManual(false);
              const found = modelsForMake.find((m) => m.id === id);
              onModelChange(found?.name ?? "");
            }}
            className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
            style={fieldStyle("vehicle_model")}
          >
            <option value="">—</option>
            {modelsForMake.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
        {canEdit && !modelIsManual && !makeIsManual ? (
          <button
            type="button"
            className="mt-1 text-[10px] font-semibold"
            style={{ color: IC.blue }}
            onClick={() => {
              setModelIsManual(true);
              setModelId("");
            }}
          >
            Enter model manually
          </button>
        ) : null}
      </label>

      <label className="block text-xs">
        <span style={{ color: labelColor("vehicle_trim") }}>Trim</span>
        <input
          name="vehicle_trim"
          value={trim}
          readOnly={!canEdit}
          onChange={(e) => onTrimChange(e.target.value)}
          className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
          style={fieldStyle("vehicle_trim")}
        />
      </label>

      <label className="block text-xs">
        <span style={{ color: labelColor("color") }}>Color</span>
        <select
          name="color"
          value={color}
          disabled={!canEdit}
          onChange={(e) => onColorChange(e.target.value)}
          className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
          style={fieldStyle("color")}
        >
          <option value="">—</option>
          {COLORS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
          {color && !(COLORS as readonly string[]).includes(color) ? (
            <option value={color}>{color} (custom)</option>
          ) : null}
        </select>
      </label>

      <label className="block text-xs">
        <span style={{ color: labelColor("body_style") }}>Body style</span>
        <select
          name="body_style"
          value={bodyStyle}
          disabled={!canEdit}
          onChange={(e) => onBodyStyleChange(e.target.value)}
          className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
          style={fieldStyle("body_style")}
        >
          <option value="">—</option>
          {BODY_STYLES.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
          {bodyStyle && !(BODY_STYLES as readonly string[]).includes(bodyStyle) ? (
            <option value={bodyStyle}>{bodyStyle} (custom)</option>
          ) : null}
        </select>
      </label>

      <label className="block text-xs">
        <span style={{ color: labelColor("drivetrain") }}>Drivetrain</span>
        <select
          name="drivetrain"
          value={drivetrain}
          disabled={!canEdit}
          onChange={(e) => onDrivetrainChange(e.target.value)}
          className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm"
          style={fieldStyle("drivetrain")}
        >
          <option value="">—</option>
          {DRIVETRAINS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
          {drivetrain && !(DRIVETRAINS as readonly string[]).includes(drivetrain) ? (
            <option value={drivetrain}>{drivetrain} (custom)</option>
          ) : null}
        </select>
      </label>
    </div>
  );
}
