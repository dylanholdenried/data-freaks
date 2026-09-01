import { isMakeAllowedForDepartment } from "@/lib/vehicle";
import { storeHasDepartmentSourceLinks } from "@/lib/acquisition-sources";
import type { NormalizedDealImportRow } from "./csv-schema";
import type { ParsedCsvRow } from "./parse";

export type StoreReferenceData = {
  departments: { id: string; name: string }[];
  salespeople: { id: string; name: string }[];
  financeManagers: { id: string; name: string }[];
  acquisitionSources: { id: string; name: string }[];
  acquisitionSourceDepartments: {
    acquisition_source_id: string;
    department_id: string;
  }[];
  departmentMakes: { department_id: string; make: string }[];
  existingStockNumbers: Set<string>;
};

export type ResolvedDealImport = {
  department_id: string;
  finance_manager_id: string | null;
  salesperson_1_id: string | null;
  salesperson_2_id: string | null;
  create_salespeople: string[];
  create_finance_manager: string | null;
  create_acquisition_source: string | null;
};

export type ValidatedImportRow = {
  rowNumber: number;
  raw: Record<string, string>;
  normalized: NormalizedDealImportRow | null;
  resolved: ResolvedDealImport | null;
  errors: string[];
  warnings: string[];
  is_valid: boolean;
};

function normKey(name: string): string {
  return name.trim().toLowerCase();
}

function findByName<T extends { id: string; name: string }>(
  list: T[],
  name: string
): T | undefined {
  const key = normKey(name);
  return list.find((item) => normKey(item.name) === key);
}

/**
 * Validate parsed rows against store-scoped reference data.
 * Departments must already exist. Salespeople / F&I / sources may be created on confirm
 * when names are present.
 */
export function validateImportRows(
  parsedRows: ParsedCsvRow[],
  refs: StoreReferenceData
): ValidatedImportRow[] {
  const stockInFile = new Map<string, number>();
  const results: ValidatedImportRow[] = [];

  for (const row of parsedRows) {
    const errors = [...row.errors];
    const warnings: string[] = [];
    let resolved: ResolvedDealImport | null = null;

    if (!row.normalized) {
      results.push({
        rowNumber: row.rowNumber,
        raw: row.raw,
        normalized: null,
        resolved: null,
        errors,
        warnings,
        is_valid: false,
      });
      continue;
    }

    const n = row.normalized;
    const stockKey = n.stock_number.trim().toLowerCase();
    if (stockInFile.has(stockKey)) {
      errors.push(
        `Duplicate stock_number in file (also on row ${stockInFile.get(stockKey)})`
      );
    } else {
      stockInFile.set(stockKey, row.rowNumber);
    }

    if (refs.existingStockNumbers.has(stockKey)) {
      errors.push(`stock_number already exists for this store`);
    }

    const department = findByName(refs.departments, n.department);
    if (!department) {
      errors.push(
        `department "${n.department}" not found on this store (create the department first)`
      );
    } else if (
      !isMakeAllowedForDepartment(n.vehicle_make, department.id, refs.departmentMakes)
    ) {
      errors.push(
        `vehicle_make "${n.vehicle_make}" is not allowed for department "${n.department}"`
      );
    }

    if (n.status === "pending") {
      warnings.push("Incomplete row — will import as pending");
    }

    const create_salespeople: string[] = [];
    let salesperson_1_id: string | null = null;
    let salesperson_2_id: string | null = null;

    if (n.salesperson_1) {
      const sp1 = findByName(refs.salespeople, n.salesperson_1);
      if (sp1) {
        salesperson_1_id = sp1.id;
      } else {
        create_salespeople.push(n.salesperson_1);
        warnings.push(`Will create salesperson "${n.salesperson_1}"`);
      }
    }

    if (n.salesperson_2) {
      const sp2 = findByName(refs.salespeople, n.salesperson_2);
      if (sp2) {
        salesperson_2_id = sp2.id;
      } else if (
        !create_salespeople.some((name) => normKey(name) === normKey(n.salesperson_2!))
      ) {
        create_salespeople.push(n.salesperson_2);
        warnings.push(`Will create salesperson "${n.salesperson_2}"`);
      }
    }

    let finance_manager_id: string | null = null;
    let create_finance_manager: string | null = null;
    if (n.finance_manager) {
      const fm = findByName(refs.financeManagers, n.finance_manager);
      if (fm) {
        finance_manager_id = fm.id;
      } else {
        create_finance_manager = n.finance_manager;
        warnings.push(`Will create finance manager "${n.finance_manager}"`);
      }
    }

    let create_acquisition_source: string | null = null;
    if (n.acquisition_source) {
      const src = findByName(refs.acquisitionSources, n.acquisition_source);
      if (!src) {
        create_acquisition_source = n.acquisition_source;
        warnings.push(`Will create acquisition source "${n.acquisition_source}"`);
      } else if (department) {
        const departmentIds = refs.departments.map((d) => d.id);
        if (storeHasDepartmentSourceLinks(departmentIds, refs.acquisitionSourceDepartments)) {
          const allowed = refs.acquisitionSourceDepartments.some(
            (link) =>
              link.acquisition_source_id === src.id &&
              link.department_id === department.id
          );
          if (!allowed) {
            errors.push(
              `acquisition_source "${n.acquisition_source}" is not configured for department "${n.department}"`
            );
          }
        }
      }
    }

    if (department) {
      resolved = {
        department_id: department.id,
        finance_manager_id,
        salesperson_1_id,
        salesperson_2_id,
        create_salespeople,
        create_finance_manager,
        create_acquisition_source,
      };
    }

    results.push({
      rowNumber: row.rowNumber,
      raw: row.raw,
      normalized: n,
      resolved,
      errors,
      warnings,
      is_valid: errors.length === 0 && resolved != null,
    });
  }

  return results;
}
