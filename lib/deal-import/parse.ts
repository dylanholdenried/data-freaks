import Papa from "papaparse";
import {
  DEAL_IMPORT_HEADERS,
  dealImportRowSchema,
  toNormalizedDealImportRow,
  type DealImportHeader,
  type NormalizedDealImportRow,
} from "./csv-schema";

export type ParsedCsvRow = {
  rowNumber: number;
  raw: Record<string, string>;
  normalized: NormalizedDealImportRow | null;
  errors: string[];
};

function stringifyCell(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

export function parseDealImportCsv(csvText: string): {
  headers: string[];
  rows: ParsedCsvRow[];
  fileErrors: string[];
} {
  const fileErrors: string[] = [];
  const parsed = Papa.parse<Record<string, unknown>>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });

  if (parsed.errors.length > 0) {
    for (const err of parsed.errors) {
      // Field-count issues are row-level; header/structure issues stay file-level
      if (err.code === "TooFewFields" || err.code === "TooManyFields") {
        continue;
      }
      fileErrors.push(
        err.row != null
          ? `CSV parse error at row ${err.row + 1}: ${err.message}`
          : `CSV parse error: ${err.message}`
      );
    }
  }

  const headers = (parsed.meta.fields ?? []).filter((h) => h && h.trim() !== "");
  const missing = DEAL_IMPORT_HEADERS.filter((h) => !headers.includes(h));
  const unexpected = headers.filter(
    (h) => !(DEAL_IMPORT_HEADERS as readonly string[]).includes(h)
  );

  if (missing.length > 0) {
    fileErrors.push(`Missing required columns: ${missing.join(", ")}`);
  }
  if (unexpected.length > 0) {
    fileErrors.push(`Unexpected columns (remove or rename): ${unexpected.join(", ")}`);
  }

  const rows: ParsedCsvRow[] = [];

  if (fileErrors.length > 0) {
    return { headers, rows, fileErrors };
  }

  parsed.data.forEach((record, index) => {
    const rowNumber = index + 2; // header is row 1
    const raw: Record<string, string> = {};
    for (const h of DEAL_IMPORT_HEADERS) {
      raw[h] = stringifyCell(record[h]);
    }

    // Skip completely blank data rows
    const allBlank = DEAL_IMPORT_HEADERS.every((h) => raw[h] === "");
    if (allBlank) return;

    const result = dealImportRowSchema.safeParse(raw);
    if (!result.success) {
      rows.push({
        rowNumber,
        raw,
        normalized: null,
        errors: result.error.issues.map((i) =>
          i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message
        ),
      });
      return;
    }

    rows.push({
      rowNumber,
      raw,
      normalized: toNormalizedDealImportRow(result.data),
      errors: [],
    });
  });

  if (rows.length === 0) {
    fileErrors.push("CSV has no data rows");
  }

  return { headers: [...DEAL_IMPORT_HEADERS] as DealImportHeader[] as unknown as string[], rows, fileErrors };
}
