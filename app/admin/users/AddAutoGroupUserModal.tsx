"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import StoreAccessFields, { PhoneField } from "@/app/admin/groups/[id]/StoreAccessFields";
import type { SaveResult } from "@/app/admin/groups/[id]/FormWithSaveToast";
import { createAutoGroupUserFromUsersPage } from "./actions";

type StoreOption = { id: string; name: string; dealer_group_id: string };
type GroupOption = { id: string; name: string };

type Props = {
  groups: GroupOption[];
  stores: StoreOption[];
};

export default function AddAutoGroupUserModal({ groups, stores }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [toast, setToast] = useState<{ text: string; warning?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const timerRef = useRef<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const groupStores = useMemo(
    () => stores.filter((s) => s.dealer_group_id === groupId).map((s) => ({ id: s.id, name: s.name })),
    [stores, groupId]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  function flashToast(text: string, warning?: string) {
    setToast({ text, warning });
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setToast(null), warning ? 6000 : 3500);
  }

  function close() {
    setOpen(false);
    setError(null);
    formRef.current?.reset();
    setGroupId(groups[0]?.id ?? "");
  }

  return (
    <>
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 top-4 z-50 max-w-sm animate-in fade-in slide-in-from-top-2 rounded-md border border-emerald-300 bg-emerald-600 px-4 py-3 text-sm font-medium text-white shadow-lg"
        >
          {toast.text}
          {toast.warning ? (
            <p className="mt-1 text-xs font-normal text-emerald-100">{toast.warning}</p>
          ) : null}
        </div>
      ) : null}

      <Button type="button" size="sm" onClick={() => setOpen(true)} disabled={groups.length === 0}>
        + Add User
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-ag-user-title"
            className="app-panel max-h-[90vh] w-full max-w-lg overflow-y-auto p-6"
          >
            <h2 id="add-ag-user-title" className="text-lg font-semibold tracking-tight text-foreground">
              Add Auto Group User
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Create an account for an auto group. They will receive an email to set their password
              and log in.
            </p>

            <form
              ref={formRef}
              className="mt-5 space-y-4"
              action={(formData) => {
                setError(null);
                startTransition(async () => {
                  try {
                    const result = (await createAutoGroupUserFromUsersPage(
                      formData
                    )) as SaveResult | void;
                    if (!result) return;
                    if (!result.saved) {
                      setError(result.error);
                      return;
                    }
                    flashToast(result.message || "User Created", result.emailWarning);
                    close();
                    router.refresh();
                  } catch (err: any) {
                    setError(err?.message || "Could not create user");
                  }
                });
              }}
            >
              <input type="hidden" name="status" value="invited" />

              <div>
                <label
                  className="mb-1 block text-xs font-medium text-muted-foreground"
                  htmlFor="users_page_dealer_group"
                >
                  Auto group
                </label>
                <select
                  id="users_page_dealer_group"
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

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label
                    className="mb-1 block text-xs font-medium text-muted-foreground"
                    htmlFor="users_page_first_name"
                  >
                    First name
                  </label>
                  <Input id="users_page_first_name" name="first_name" placeholder="Jane" required />
                </div>
                <div>
                  <label
                    className="mb-1 block text-xs font-medium text-muted-foreground"
                    htmlFor="users_page_last_name"
                  >
                    Last name
                  </label>
                  <Input id="users_page_last_name" name="last_name" placeholder="Doe" required />
                </div>
              </div>

              <div>
                <label
                  className="mb-1 block text-xs font-medium text-muted-foreground"
                  htmlFor="users_page_email"
                >
                  Email
                </label>
                <Input
                  id="users_page_email"
                  name="email"
                  type="email"
                  required
                  placeholder="jane@dealer.com"
                />
              </div>

              <PhoneField id="users_page_phone" />

              <StoreAccessFields
                key={groupId}
                stores={groupStores}
                idPrefix="users_page_user"
              />

              <p className="text-[11px] text-muted-foreground">
                If this email already has an account, they will be moved into this auto group (one
                email = one account).
              </p>

              {error ? <p className="text-sm text-red-600">{error}</p> : null}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={close}>
                  Cancel
                </Button>
                <Button type="submit">Create User</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
