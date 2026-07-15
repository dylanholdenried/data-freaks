import { isMakeAllowedForDepartment } from "@/lib/vehicle";

export type CanCloseInput = {
  vin: string;
  vehicleMake: string;
  departmentId: string;
  departmentMakes: { department_id: string; make: string }[];
  financeManagerId: string;
};

export function canClose(input: CanCloseInput): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!input.vin.trim()) reasons.push("VIN is required to close");
  if (
    input.vehicleMake.trim() &&
    input.departmentId &&
    !isMakeAllowedForDepartment(
      input.vehicleMake,
      input.departmentId,
      input.departmentMakes
    )
  ) {
    reasons.push("Make is not valid for this department");
  }
  if (!input.financeManagerId) reasons.push("Finance manager is required to close");
  return { ok: reasons.length === 0, reasons };
}
