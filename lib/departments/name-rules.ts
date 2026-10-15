import { isPreOwnedDepartment } from "@/lib/buy-box/sale-books";
import { isFiDepartment } from "@/lib/dashboard/pace";

export const DEPARTMENT_NAME_MAX = 80;

export function normalizeDepartmentName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function departmentNameKey(name: string): string {
  return normalizeDepartmentName(name).toLowerCase();
}

/**
 * Department names drive behavior elsewhere (Pre-Owned → Buy Box / pricing /
 * inventory; F&I → excluded from sales cards). Returns a message when a rename
 * would flip either, otherwise null.
 */
export function renameBehaviorChange(oldName: string, newName: string): string | null {
  if (isPreOwnedDepartment(oldName) !== isPreOwnedDepartment(newName)) {
    return isPreOwnedDepartment(oldName)
      ? "This name would stop the department from being treated as Pre-Owned (Buy Box, pricing discipline, inventory). Keep a word like Used, Pre-Owned, or CPO in the name."
      : "This name would make the department count as Pre-Owned (Buy Box, pricing discipline, inventory). Avoid words like Used, Pre-Owned, or CPO.";
  }
  if (isFiDepartment(oldName) !== isFiDepartment(newName)) {
    return isFiDepartment(oldName)
      ? "This name would stop the department from being treated as F&I, which changes dashboard and calendar totals."
      : "This name would make the department count as F&I, which removes it from dashboard and calendar sales cards.";
  }
  return null;
}
