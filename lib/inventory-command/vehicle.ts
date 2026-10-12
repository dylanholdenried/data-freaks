/** Split a vAuto "Vehicle" string ("2022 Chevrolet Silverado 1500 LTZ") into year / make / model / trim. */

const MULTI_WORD_MAKES = [
  "Land Rover",
  "Alfa Romeo",
  "Aston Martin",
  "Rolls Royce",
  "Rolls-Royce",
  "Mercedes Benz",
] as const;

/** Models whose name spans more than one token; matched case-insensitively after the make. */
const MULTI_WORD_MODELS = [
  "Grand Cherokee",
  "Grand Caravan",
  "Grand Wagoneer",
  "Grand Marquis",
  "Grand Prix",
  "Santa Fe",
  "Santa Cruz",
  "Range Rover",
  "Range Rover Sport",
  "Range Rover Evoque",
  "Range Rover Velar",
  "Land Cruiser",
  "Grand Highlander",
  "Encore GX",
  "Town & Country",
  "Wrangler Unlimited",
  "Transit Connect",
  "Crown Victoria",
  "Monte Carlo",
  "Model 3",
  "Model S",
  "Model X",
  "Model Y",
  "Bronco Sport",
  "Trax Crossover",
  "Envision Avenir",
  "Discovery Sport",
  "Mustang Mach-E",
  "Express Cargo",
  "Promaster City",
  "ProMaster City",
] as const;

export type VehicleParts = {
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
};

export function parseVehicleParts(veh: string | null | undefined): VehicleParts {
  const text = veh?.trim();
  if (!text) return { year: null, make: null, model: null, trim: null };
  const parts = text.split(/\s+/);
  let i = 0;
  let year: number | null = null;
  if (/^\d{4}$/.test(parts[0] ?? "")) {
    year = parseInt(parts[0]!, 10);
    i = 1;
  }
  if (i >= parts.length) return { year, make: null, model: null, trim: null };

  let make = parts[i]!;
  const twoMake = parts.slice(i, i + 2).join(" ").toLowerCase();
  const multiMake = MULTI_WORD_MAKES.find((m) => m.toLowerCase() === twoMake);
  if (multiMake) {
    make = multiMake;
    i += 2;
  } else {
    i += 1;
  }

  const rest = parts.slice(i);
  if (rest.length === 0) return { year, make, model: null, trim: null };

  let modelLen = 1;
  for (const m of MULTI_WORD_MODELS) {
    const words = m.split(" ");
    if (rest.slice(0, words.length).join(" ").toLowerCase() === m.toLowerCase()) {
      modelLen = Math.max(modelLen, words.length);
    }
  }
  // "3 Series", "X5 Series" style names.
  const seriesName = modelLen === 1 && /^series$/i.test(rest[1] ?? "");
  if (seriesName) modelLen = 2;
  // Series tokens like "1500", "2500HD", "350" belong to the model, not the trim.
  if (!seriesName && rest.length > modelLen && /^\d{3,4}[A-Za-z]*$/.test(rest[modelLen]!)) {
    modelLen += 1;
  }

  const model = rest.slice(0, modelLen).join(" ");
  const trim = rest.slice(modelLen).join(" ") || null;
  return { year, make, model, trim };
}
