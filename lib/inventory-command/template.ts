import { TEMPLATE_HEADERS } from "./parse";

/** CSV template with header row only — correct column order for manual uploads. */
export function buildInventoryCsvTemplate(): string {
  return TEMPLATE_HEADERS.join(",") + "\n";
}

export const INVENTORY_TEMPLATE_FILENAME = "inventory-command-template.csv";
