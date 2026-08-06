"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { isStoreScopedRole, type AutoGroupUserRole } from "@/lib/roles";

type StoreOption = { id: string; name: string };

type Props = {
  stores: StoreOption[];
  defaultRole?: AutoGroupUserRole;
  defaultStoreIds?: string[];
  /** When true, include a name="role" select; otherwise parent provides role. */
  includeRoleSelect?: boolean;
  roleSelectName?: string;
  idPrefix?: string;
};

export default function StoreAccessFields({
  stores,
  defaultRole = "store_admin",
  defaultStoreIds = [],
  includeRoleSelect = true,
  roleSelectName = "role",
  idPrefix = "user",
}: Props) {
  const [role, setRole] = useState<AutoGroupUserRole>(defaultRole);
  const needsStores = isStoreScopedRole(role);

  return (
    <div className="space-y-3 sm:col-span-2 lg:col-span-full">
      {includeRoleSelect ? (
        <div>
          <label
            className="mb-1 block text-xs font-medium text-muted-foreground"
            htmlFor={`${idPrefix}_role`}
          >
            Role
          </label>
          <select
            id={`${idPrefix}_role`}
            name={roleSelectName}
            value={role}
            onChange={(e) => setRole(e.target.value as AutoGroupUserRole)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="store_admin">Store admin</option>
            <option value="store_viewer">View Only</option>
            <option value="group_admin">Group admin</option>
          </select>
        </div>
      ) : null}

      {needsStores ? (
        <fieldset className="rounded-md border border-border p-3">
          <legend className="px-1 text-xs font-medium text-muted-foreground">Assigned stores</legend>
          {stores.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Add stores to this auto group before assigning store access.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {stores.map((store) => (
                <label key={store.id} className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    name="store_ids"
                    value={store.id}
                    defaultChecked={defaultStoreIds.includes(store.id)}
                    className="h-4 w-4 rounded border-border"
                  />
                  {store.name}
                </label>
              ))}
            </div>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            {role === "store_viewer"
              ? "View Only users can see assigned stores but cannot add, edit, or remove anything."
              : "Store admins can only view and edit the stores checked above."}
          </p>
        </fieldset>
      ) : (
        <p className="text-xs text-muted-foreground">
          Group admins can access all stores in this auto group.
        </p>
      )}
    </div>
  );
}

/** Phone input shared by create/edit user forms. */
export function PhoneField({
  id,
  defaultValue = "",
}: {
  id: string;
  defaultValue?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor={id}>
        Phone
      </label>
      <Input
        id={id}
        name="phone"
        type="tel"
        defaultValue={defaultValue}
        placeholder="Optional"
        className="h-10"
      />
    </div>
  );
}
