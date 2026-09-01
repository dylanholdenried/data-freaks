export type AcquisitionSourceOption = {
  id: string;
  name: string;
  active?: boolean;
};

export type AcquisitionSourceDepartmentLink = {
  acquisition_source_id: string;
  department_id: string;
};

function normSourceName(name: string): string {
  return name.trim().toLowerCase();
}

/** True when any department on this store has junction rows configured. */
export function storeHasDepartmentSourceLinks(
  departmentIds: string[],
  links: AcquisitionSourceDepartmentLink[]
): boolean {
  const deptSet = new Set(departmentIds);
  return links.some((link) => deptSet.has(link.department_id));
}

/**
 * Sources shown in the deal dropdown for a department.
 * Falls back to all active store sources when the store has no junction rows yet.
 */
export function filterAcquisitionSourcesForDepartment(
  allSources: AcquisitionSourceOption[],
  links: AcquisitionSourceDepartmentLink[],
  departmentId: string,
  departmentIds: string[],
  currentSourceName?: string | null
): AcquisitionSourceOption[] {
  if (!departmentId) return [];

  const useDepartmentFilter = storeHasDepartmentSourceLinks(departmentIds, links);

  let filtered: AcquisitionSourceOption[];
  if (!useDepartmentFilter) {
    filtered = allSources.filter((s) => s.active !== false);
  } else {
    const allowedIds = new Set(
      links.filter((l) => l.department_id === departmentId).map((l) => l.acquisition_source_id)
    );
    filtered = allSources.filter((s) => allowedIds.has(s.id) && s.active !== false);
  }

  const current = currentSourceName?.trim();
  if (current && !filtered.some((s) => normSourceName(s.name) === normSourceName(current))) {
    const match = allSources.find((s) => normSourceName(s.name) === normSourceName(current));
    if (match) {
      filtered = [...filtered, match].sort((a, b) => a.name.localeCompare(b.name));
    } else {
      filtered = [...filtered, { id: `legacy:${current}`, name: current }].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
    }
  }

  return filtered;
}

export function flattenAcquisitionSourceDepartmentLinks(
  sources: Array<{
    id: string;
    acquisition_source_departments?: { department_id: string }[] | null;
  }>
): AcquisitionSourceDepartmentLink[] {
  const links: AcquisitionSourceDepartmentLink[] = [];
  for (const source of sources) {
    for (const row of source.acquisition_source_departments ?? []) {
      links.push({
        acquisition_source_id: source.id,
        department_id: row.department_id,
      });
    }
  }
  return links;
}
