"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createUserInGroup } from "@/app/admin/actions";
import StoreAccessFields, { PhoneField } from "./StoreAccessFields";
import type { SaveResult } from "./FormWithSaveToast";

type StoreOption = { id: string; name: string };

type Props = {
  dealerGroupId: string;
  stores: StoreOption[];
};

export default function AddUserModal({ dealerGroupId, stores }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; warning?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const timerRef = useRef<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

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

      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        Add User
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-user-title"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
          >
            <h2 id="add-user-title" className="text-lg font-semibold tracking-tight text-slate-900">
              Add User
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Create an account for this auto group. They will receive an email to set their password
              and log in.
            </p>

            <form
              ref={formRef}
              className="mt-5 space-y-4"
              action={(formData) => {
                setError(null);
                startTransition(async () => {
                  try {
                    const result = (await createUserInGroup(formData)) as SaveResult | void;
                    if (!result?.saved) return;
                    flashToast(result.message || "User Created", result.emailWarning);
                    close();
                    if (result.redirectTo) {
                      router.push(result.redirectTo);
                    }
                    router.refresh();
                  } catch (err: any) {
                    setError(err?.message || "Could not create user");
                  }
                });
              }}
            >
              <input type="hidden" name="dealer_group_id" value={dealerGroupId} />
              <input type="hidden" name="status" value="active" />

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label
                    className="mb-1 block text-xs font-medium text-slate-600"
                    htmlFor="modal_first_name"
                  >
                    First name
                  </label>
                  <Input id="modal_first_name" name="first_name" placeholder="Jane" required />
                </div>
                <div>
                  <label
                    className="mb-1 block text-xs font-medium text-slate-600"
                    htmlFor="modal_last_name"
                  >
                    Last name
                  </label>
                  <Input id="modal_last_name" name="last_name" placeholder="Doe" required />
                </div>
              </div>

              <div>
                <label
                  className="mb-1 block text-xs font-medium text-slate-600"
                  htmlFor="modal_email"
                >
                  Email
                </label>
                <Input
                  id="modal_email"
                  name="email"
                  type="email"
                  required
                  placeholder="jane@dealer.com"
                />
              </div>

              <PhoneField id="modal_phone" />

              <StoreAccessFields stores={stores} idPrefix="modal_user" />

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
