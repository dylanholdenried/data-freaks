"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  activateAutoGroup,
  DEFAULT_DEPARTMENTS,
  saveProvisionDraft,
  type ProvisionDraftPayload,
  type ProvisionStoreInput,
} from "@/app/admin/provision-actions";

export type ProvisionPageRequest = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  title: string | null;
  website: string | null;
  number_of_stores: number | null;
  dealer_group_name: string;
  status: string;
  created_at: string;
  notes: string | null;
  requested_user_id: string | null;
  dealer_group_id: string | null;
};

export type ProvisionPageProfile = {
  id: string;
  user_id: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
} | null;

export type ProvisionPageGroup = {
  id: string;
  name: string;
  plan: string;
  website: string | null;
} | null;

export type ProvisionPageStore = {
  id: string;
  name: string;
  departments: { id: string; name: string }[];
};

type Props = {
  request: ProvisionPageRequest;
  profile: ProvisionPageProfile;
  group: ProvisionPageGroup;
  initialStores: ProvisionPageStore[];
};

function newStore(name = "", departments: string[] = [...DEFAULT_DEPARTMENTS]): ProvisionStoreInput {
  return { name, departments };
}

export default function ProvisionWizardClient({ request, profile, group, initialStores }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [groupName, setGroupName] = useState(group?.name || request.dealer_group_name);
  const [plan, setPlan] = useState<"free" | "paid" | "premium">(
    (group?.plan as "free" | "paid" | "premium") || "free"
  );
  const [website, setWebsite] = useState(group?.website || request.website || "");
  const [adminFirstName, setAdminFirstName] = useState(
    profile?.first_name || request.first_name || ""
  );
  const [adminLastName, setAdminLastName] = useState(profile?.last_name || request.last_name || "");
  const [adminEmail, setAdminEmail] = useState(profile?.email || request.email || "");
  const [adminPhone, setAdminPhone] = useState(profile?.phone || "");

  const [stores, setStores] = useState<ProvisionStoreInput[]>(() => {
    if (initialStores.length > 0) {
      return initialStores.map((s) => ({
        id: s.id,
        name: s.name,
        departments: s.departments.map((d) => d.name),
      }));
    }
    const count = Math.max(1, request.number_of_stores || 1);
    return Array.from({ length: count }, (_, i) =>
      newStore(i === 0 ? `${request.dealer_group_name} — Main` : `Store ${i + 1}`)
    );
  });

  const canActivate = useMemo(() => {
    return Boolean(groupName.trim() && adminEmail.trim() && stores.some((s) => s.name.trim()));
  }, [groupName, adminEmail, stores]);

  function updateStore(index: number, patch: Partial<ProvisionStoreInput>) {
    setStores((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function setDepartmentsText(index: number, text: string) {
    const departments = text
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
    updateStore(index, { departments });
  }

  function buildPayload(): ProvisionDraftPayload {
    return {
      groupName,
      plan,
      website,
      adminFirstName,
      adminLastName,
      adminEmail,
      adminPhone,
      stores: stores.filter((s) => s.name.trim()),
    };
  }

  function onSaveDraft() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await saveProvisionDraft(request.id, buildPayload());
        setMessage("Draft saved. You can activate when ready.");
        router.refresh();
      } catch (err: any) {
        setError(err?.message || "Failed to save draft");
      }
    });
  }

  function onActivate() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await saveProvisionDraft(request.id, buildPayload());
        await activateAutoGroup(request.id);
      } catch (err: any) {
        // redirect() throws a NEXT_REDIRECT error in some Next versions — ignore those
        if (err?.digest?.startsWith?.("NEXT_REDIRECT") || err?.message === "NEXT_REDIRECT") {
          return;
        }
        setError(err?.message || "Failed to activate");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/requests" className="text-xs text-muted-foreground hover:text-foreground">
            ← Requests
          </Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">Provision auto group</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Confirm signup details, create stores and departments, then activate the group admin.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={onSaveDraft}>
            Save draft
          </Button>
          <Button type="button" disabled={pending || !canActivate} onClick={onActivate}>
            Activate Auto Group
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Request summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs text-muted-foreground">Submitted</div>
            <div>{new Date(request.created_at).toLocaleString()}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Title</div>
            <div>{request.title || "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Requested stores</div>
            <div>{request.number_of_stores ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Website</div>
            <div>{request.website || "—"}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Auto group</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="text-xs font-medium text-muted-foreground">Group name</span>
            <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Plan</span>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={plan}
              onChange={(e) => setPlan(e.target.value as "free" | "paid" | "premium")}
            >
              <option value="free">free</option>
              <option value="paid">paid</option>
              <option value="premium">premium</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Website</span>
            <Input value={website} onChange={(e) => setWebsite(e.target.value)} />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Group admin</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">First name</span>
            <Input value={adminFirstName} onChange={(e) => setAdminFirstName(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Last name</span>
            <Input value={adminLastName} onChange={(e) => setAdminLastName(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Email</span>
            <Input value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Phone</span>
            <Input value={adminPhone} onChange={(e) => setAdminPhone(e.target.value)} />
          </label>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Role will be <span className="font-medium text-foreground">group_admin</span>. Uses the
            existing signup account (no duplicate auth user).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-semibold">Stores & departments</CardTitle>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setStores((prev) => [...prev, newStore(`Store ${prev.length + 1}`)])}
          >
            Add store
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {stores.map((store, index) => (
            <div key={store.id || `new-${index}`} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-[200px] flex-1 space-y-1 text-sm">
                  <span className="text-xs font-medium text-muted-foreground">Store name</span>
                  <Input
                    value={store.name}
                    onChange={(e) => updateStore(index, { name: e.target.value })}
                  />
                </label>
                {stores.length > 1 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setStores((prev) => prev.filter((_, i) => i !== index))}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
              <label className="block space-y-1 text-sm">
                <span className="text-xs font-medium text-muted-foreground">
                  Departments (comma-separated)
                </span>
                <Input
                  value={store.departments.join(", ")}
                  onChange={(e) => setDepartmentsText(index, e.target.value)}
                  placeholder="New, Used, F&I"
                />
              </label>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
