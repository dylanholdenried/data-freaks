"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import StoreAccessFields from "@/app/admin/groups/[id]/StoreAccessFields";
import { approveJoinExistingRequest } from "@/app/admin/provision-actions";
import { formatProfileName } from "@/lib/profile-display";

export type AssignAccessRequest = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  dealer_group_name: string;
};

type GroupOption = { id: string; name: string };
type StoreOption = { id: string; name: string; dealer_group_id: string };

function suggestDefaults(
  requestedName: string,
  groups: GroupOption[],
  stores: StoreOption[]
): { groupId: string; storeIds: string[] } {
  const needle = requestedName.trim().toLowerCase();
  if (!needle) {
    return { groupId: groups[0]?.id ?? "", storeIds: [] };
  }

  const exactStore = stores.find((s) => s.name.trim().toLowerCase() === needle);
  if (exactStore) {
    return { groupId: exactStore.dealer_group_id, storeIds: [exactStore.id] };
  }

  const partialStore = stores.find(
    (s) =>
      s.name.toLowerCase().includes(needle) || needle.includes(s.name.toLowerCase())
  );
  if (partialStore) {
    return { groupId: partialStore.dealer_group_id, storeIds: [partialStore.id] };
  }

  const groupMatch = groups.find(
    (g) => g.name.toLowerCase().includes(needle) || needle.includes(g.name.toLowerCase())
  );
  return { groupId: groupMatch?.id ?? groups[0]?.id ?? "", storeIds: [] };
}

type Props = {
  request: AssignAccessRequest;
  groups: GroupOption[];
  stores: StoreOption[];
  triggerLabel?: string;
  triggerVariant?: "outline" | "default" | "ghost";
};

export default function AssignExistingAccessModal({
  request,
  groups,
  stores,
  triggerLabel = "Assign access",
  triggerVariant = "outline",
}: Props) {
  const router = useRouter();
  const defaults = useMemo(
    () => suggestDefaults(request.dealer_group_name, groups, stores),
    [request.dealer_group_name, groups, stores]
  );
  const [open, setOpen] = useState(false);
  const [groupId, setGroupId] = useState(defaults.groupId);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const groupStores = useMemo(
    () => stores.filter((s) => s.dealer_group_id === groupId).map((s) => ({ id: s.id, name: s.name })),
    [stores, groupId]
  );

  const displayName = formatProfileName(request.first_name, request.last_name);

  function close() {
    setOpen(false);
    setError(null);
    setGroupId(defaults.groupId);
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant={triggerVariant}
        onClick={() => {
          setGroupId(defaults.groupId);
          setError(null);
          setOpen(true);
        }}
      >
        {triggerLabel}
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`assign-access-${request.id}`}
            className="app-panel max-h-[90vh] w-full max-w-lg overflow-y-auto p-6"
          >
            <h2
              id={`assign-access-${request.id}`}
              className="text-lg font-semibold tracking-tight text-foreground"
            >
              Assign access
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {displayName} ({request.email}) asked to join{" "}
              <span className="font-medium text-foreground">{request.dealer_group_name}</span>.
              Choose the existing auto group and store access — this does not create a new group.
            </p>

            <form
              className="mt-5 space-y-4"
              action={(formData) => {
                setError(null);
                startTransition(async () => {
                  try {
                    const result = await approveJoinExistingRequest(formData);
                    if (!result.saved) {
                      setError(result.error || "Could not assign access");
                      return;
                    }
                    close();
                    router.refresh();
                  } catch (err: any) {
                    setError(err?.message || "Could not assign access");
                  }
                });
              }}
            >
              <input type="hidden" name="request_id" value={request.id} />

              <div>
                <label
                  className="mb-1 block text-xs font-medium text-muted-foreground"
                  htmlFor={`assign_group_${request.id}`}
                >
                  Auto group
                </label>
                <select
                  id={`assign_group_${request.id}`}
                  name="dealer_group_id"
                  required
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>

              <StoreAccessFields
                key={`${request.id}-${groupId}`}
                stores={groupStores}
                defaultRole="store_admin"
                defaultStoreIds={
                  groupId === defaults.groupId ? defaults.storeIds : []
                }
                idPrefix={`assign_${request.id}`}
              />

              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={close} disabled={pending}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending || groups.length === 0}>
                  {pending ? "Assigning…" : "Grant access"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
