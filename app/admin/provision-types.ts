export const DEFAULT_DEPARTMENTS = ["New", "Used", "F&I"];

export type ProvisionStoreInput = {
  /** Existing store id when updating a draft; omit for new stores */
  id?: string;
  name: string;
  departments: string[];
};

export type ProvisionDraftPayload = {
  groupName: string;
  plan: "log" | "analyze" | "advise";
  website?: string | null;
  adminFirstName: string;
  adminLastName: string;
  adminEmail: string;
  adminPhone?: string | null;
  stores: ProvisionStoreInput[];
};
