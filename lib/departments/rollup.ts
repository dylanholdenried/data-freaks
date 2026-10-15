export type DeptRollup = {
  id: string;
  name: string;
  store_id: string;
  rolls_up_to_department_id: string | null;
};

/** Dashboard / calendar card id: parent if this dept rolls up, else itself. */
export function cardDepartmentId(dept: DeptRollup): string {
  return dept.rolls_up_to_department_id ?? dept.id;
}

export function isRolledUpDepartment(
  dept: Pick<DeptRollup, "rolls_up_to_department_id">
): boolean {
  return Boolean(dept.rolls_up_to_department_id);
}

/** Parent id plus every department that rolls up to it. */
export function rollupIdsFor(
  parentId: string,
  departments: Pick<DeptRollup, "id" | "rolls_up_to_department_id">[]
): string[] {
  const ids = [parentId];
  for (const dept of departments) {
    if (dept.rolls_up_to_department_id === parentId) ids.push(dept.id);
  }
  return ids;
}

export function rollupIdSet(
  parentId: string,
  departments: Pick<DeptRollup, "id" | "rolls_up_to_department_id">[]
): Set<string> {
  return new Set(rollupIdsFor(parentId, departments));
}

/** Retail for the parent desk; "Fleet" when the child name contains Fleet. */
export function rollupSegmentLabel(
  dept: Pick<DeptRollup, "name" | "rolls_up_to_department_id">
): string {
  if (!dept.rolls_up_to_department_id) return "Retail";
  if (/\bfleet\b/i.test(dept.name)) return "Fleet";
  return dept.name;
}

/**
 * Active departments, plus inactive ones that still have activity in the period
 * (deals or goals), plus the rollup parents those need for their card.
 */
export function departmentsVisibleForPeriod<
  T extends { id: string; is_active?: boolean | null; rolls_up_to_department_id: string | null },
>(departments: T[], idsWithActivity: Iterable<string>): T[] {
  const withActivity = new Set(idsWithActivity);
  const keep = new Set(
    departments.filter((d) => d.is_active !== false || withActivity.has(d.id)).map((d) => d.id)
  );
  for (const dept of departments) {
    if (keep.has(dept.id) && dept.rolls_up_to_department_id) {
      keep.add(dept.rolls_up_to_department_id);
    }
  }
  return departments.filter((d) => keep.has(d.id));
}

export function mapDealToCardDepartmentId(
  departmentId: string,
  departments: DeptRollup[]
): string {
  const dept = departments.find((d) => d.id === departmentId);
  if (!dept) return departmentId;
  return cardDepartmentId(dept);
}
