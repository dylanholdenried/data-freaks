import type { SupabaseClient } from "@supabase/supabase-js";

export type CatalogMake = { id: string; name: string };
export type CatalogModel = { id: string; name: string; make_id: string };

/**
 * Series / tonnage tokens.
 * Trailing on a model name: ProMaster 2500 → ProMaster, RX 350 → RX, GLE-Class → GLE.
 * In trim: Sierra + trim 1500 → Sierra 1500, GX + trim 460 → GX 460.
 */
const TRAILING_SERIES = new Set([
  "150",
  "200",
  "250",
  "300",
  "350",
  "400",
  "450",
  "460",
  "470",
  "500",
  "550",
  "600",
  "650",
  "1500",
  "2500",
  "3500",
  "4500",
  "5500",
  "6500",
]);

const MAKE_ALIASES: Record<string, string> = {
  "mercedes benz": "mercedes-benz",
  "mercedes ben": "mercedes-benz",
  "mercedesbenz": "mercedes-benz",
  "mercedes-ben": "mercedes-benz",
  landrover: "land rover",
  "land-rover": "land rover",
  alfaromeo: "alfa romeo",
  "alfa-romeo": "alfa romeo",
  chev: "chevrolet",
  chevy: "chevrolet",
};

const TOKEN_ALIASES: Record<string, string> = {
  savanna: "savana",
};

export type ModelResolution =
  | { status: "empty" }
  | { status: "matched"; model: CatalogModel; via: "exact" | "alias" }
  | { status: "ambiguous" }
  | { status: "missing"; name: string }
  | { status: "other-make" };

function makeKey(raw: string): string {
  const basic = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (!basic) return "";
  return MAKE_ALIASES[basic] ?? MAKE_ALIASES[basic.replace(/ /g, "")] ?? basic;
}

/** Comparable model key: case, punctuation, HD/SD, LTD/LD, and a leading Chassis. */
export function modelMatchKey(raw: string): string {
  const tokens = raw
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => TOKEN_ALIASES[token] ?? token);

  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    let token = tokens[i]!;
    if (i === 0 && token === "chassis") continue;
    if (token === "ltd" || token === "ld" || token === "hd" || token === "sd") continue;
    token = token.replace(/(\d+)hd$/, "$1").replace(/(\d+)sd$/, "$1");
    if (!token) continue;
    out.push(token);
  }
  return out.join(" ");
}

const TITLE_WORDS = new Set(["max", "van", "cab", "car"]);

function displayPart(part: string): string {
  if (!part) return part;
  if (/^[a-z]{2,3}$/i.test(part) && !TITLE_WORDS.has(part.toLowerCase())) {
    return part.toUpperCase();
  }
  const series = part.match(/^(\d+)([a-z])$/i);
  if (series) return `${series[1]}${series[2]!.toLowerCase()}`;
  if (/\d/.test(part) && part.length <= 5) return part.toUpperCase();
  if (/^[a-z]{1,2}$/i.test(part)) return part.toUpperCase();
  return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
}

const DISPLAY_NAMES: Record<string, string> = {
  ecosport: "EcoSport",
  lacrosse: "LaCrosse",
};

/** Title-case an all-caps decoder name without lowercasing Q3, GX, or RS. */
export function displayModelName(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, " ");
  if (!cleaned) return "";
  const override = DISPLAY_NAMES[cleaned.toLowerCase()];
  if (override) return override;
  const hasLetter = /[a-z]/i.test(cleaned);
  const uniform =
    hasLetter && (cleaned === cleaned.toUpperCase() || cleaned === cleaned.toLowerCase());
  if (!uniform) return cleaned;
  return cleaned
    .split(" ")
    .map((token) =>
      token
        .split("-")
        .map((part) => displayPart(part))
        .join("-")
    )
    .join(" ");
}

export function resolveCatalogMake(raw: string, makes: CatalogMake[]): CatalogMake | null {
  const key = makeKey(raw);
  if (!key) return null;
  return makes.find((make) => makeKey(make.name) === key) ?? null;
}

export function resolveCatalogModel(
  raw: string,
  makeId: string,
  models: CatalogModel[],
  trimHint = "",
  makes: CatalogMake[] = []
): ModelResolution {
  const trimmed = raw.trim();
  if (!trimmed || !makeId) return { status: "empty" };

  const forMake = models.filter((model) => model.make_id === makeId);
  const wanted = modelMatchKey(trimmed);
  if (!wanted && !trimmed) return { status: "empty" };

  const keyed = forMake.map((model) => ({ model, key: modelMatchKey(model.name) }));

  // Prefer a more specific catalog model when trim carries the series
  // (GX + trim 460 → GX 460, not the bare GX row).
  const series = modelMatchKey(trimHint)
    .split(" ")
    .find((token) => TRAILING_SERIES.has(token));
  if (series && wanted) {
    const hinted = keyed.filter((row) => row.key === `${wanted} ${series}`);
    if (hinted.length === 1) {
      return { status: "matched", model: hinted[0]!.model, via: "alias" };
    }
  }

  const exact = forMake.find(
    (model) => model.name.trim().toLowerCase() === trimmed.toLowerCase()
  );
  if (exact) return { status: "matched", model: exact, via: "exact" };

  if (!wanted) return { status: "ambiguous" };

  const aliasHits = keyed.filter((row) => row.key === wanted);
  if (aliasHits.length === 1) {
    return { status: "matched", model: aliasHits[0]!.model, via: "alias" };
  }
  if (aliasHits.length > 1) return { status: "ambiguous" };

  const parts = wanted.split(" ");
  const last = parts[parts.length - 1] ?? "";
  if (parts.length >= 2 && (TRAILING_SERIES.has(last) || last === "class")) {
    const stem = parts.slice(0, -1).join(" ");
    const seriesHits = keyed.filter((row) => row.key === stem);
    if (seriesHits.length === 1) {
      return { status: "matched", model: seriesHits[0]!.model, via: "alias" };
    }
  }

  // Historical Dodge trucks were sold as Dodge 3500 / Dodge Ram 3500 before Ram was its own make.
  if (TRAILING_SERIES.has(wanted)) {
    const ramSeries = keyed.filter((row) => row.key === `ram ${wanted}`);
    if (ramSeries.length === 1) {
      return { status: "matched", model: ramSeries[0]!.model, via: "alias" };
    }
  }

  const stemHits = keyed.filter(
    (row) => row.key === wanted || row.key.startsWith(`${wanted} `)
  );
  if (stemHits.length >= 2) return { status: "ambiguous" };

  // Same model name already on another make (Camry under Ford). Do not block
  // Dodge "Ram 1500" just because Ram is a make — that historical name is valid.
  const onAnotherMake = models.some(
    (model) => model.make_id !== makeId && modelMatchKey(model.name) === wanted
  );
  if (onAnotherMake) return { status: "other-make" };

  return { status: "missing", name: displayModelName(trimmed) };
}

export type StoredCatalogFields = {
  makeId: string;
  makeName: string;
  makeIsManual: boolean;
  modelId: string;
  modelName: string;
  modelIsManual: boolean;
  note: string | null;
};

/** Map a stored make/model onto the catalog when the alias is unambiguous. Does not insert. */
export function catalogFieldsForStored(
  rawMake: string,
  rawModel: string,
  makes: CatalogMake[],
  models: CatalogModel[],
  trimHint = ""
): StoredCatalogFields {
  const make = resolveCatalogMake(rawMake, makes);
  if (!make) {
    return {
      makeId: "",
      makeName: rawMake.trim(),
      makeIsManual: Boolean(rawMake.trim()),
      modelId: "",
      modelName: rawModel.trim(),
      modelIsManual: Boolean(rawModel.trim()),
      note: null,
    };
  }

  const resolved = resolveCatalogModel(rawModel, make.id, models, trimHint, makes);
  if (resolved.status === "matched") {
    return {
      makeId: make.id,
      makeName: make.name,
      makeIsManual: false,
      modelId: resolved.model.id,
      modelName: resolved.model.name,
      modelIsManual: false,
      note:
        resolved.via === "alias"
          ? `Matched ${rawModel.trim()} to ${resolved.model.name}.`
          : null,
    };
  }

  return {
    makeId: make.id,
    makeName: make.name,
    makeIsManual: false,
    modelId: "",
    modelName: rawModel.trim(),
    modelIsManual: Boolean(rawModel.trim()),
    note: null,
  };
}

export type AdoptedVehicle = StoredCatalogFields & {
  added: CatalogModel | null;
};

/**
 * Resolve a decoded or inventory vehicle. Adds a missing model under the matched
 * make when it is not an ambiguous prefix and does not already belong to another make.
 */
export async function adoptCatalogVehicle(
  supabase: SupabaseClient,
  rawMake: string,
  rawModel: string,
  makes: CatalogMake[],
  models: CatalogModel[],
  trimHint = ""
): Promise<AdoptedVehicle> {
  const stored = catalogFieldsForStored(rawMake, rawModel, makes, models, trimHint);
  const make = resolveCatalogMake(rawMake, makes);
  if (!make) return { ...stored, added: null };

  const resolved = resolveCatalogModel(rawModel, make.id, models, trimHint, makes);
  if (resolved.status === "matched") return { ...stored, added: null };

  if (resolved.status === "ambiguous") {
    return {
      makeId: make.id,
      makeName: make.name,
      makeIsManual: false,
      modelId: "",
      modelName: "",
      modelIsManual: false,
      added: null,
      note: `${rawModel.trim()} matches more than one model. Pick the model from the list.`,
    };
  }

  if (resolved.status === "missing") {
    const added = await ensureCatalogModel(supabase, make.id, resolved.name);
    if (added) {
      return {
        makeId: make.id,
        makeName: make.name,
        makeIsManual: false,
        modelId: added.id,
        modelName: added.name,
        modelIsManual: false,
        added,
        note: `Added ${added.name} to the vehicle list.`,
      };
    }
    return {
      makeId: make.id,
      makeName: make.name,
      makeIsManual: false,
      modelId: "",
      modelName: resolved.name,
      modelIsManual: true,
      added: null,
      note: null,
    };
  }

  return { ...stored, added: null };
}

export async function ensureCatalogModel(
  supabase: SupabaseClient,
  makeId: string,
  name: string
): Promise<CatalogModel | null> {
  const { data, error } = await supabase.rpc("ensure_vehicle_model", {
    p_make_id: makeId,
    p_name: name,
  });
  if (error || !data || typeof data !== "object") return null;
  const row = data as { id?: string; name?: string };
  if (!row.id || !row.name) return null;
  return { id: row.id, name: row.name, make_id: makeId };
}
