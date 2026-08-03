"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import FormWithSaveToast from "@/app/admin/groups/[id]/FormWithSaveToast";
import StoreAccessFields, { PhoneField } from "@/app/admin/groups/[id]/StoreAccessFields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatProfileName, formatRoleLabel, formatStatusLabel } from "@/lib/profile-display";
import {
  disableAdminUser,
  resendAdminUserInvite,
  resetAdminUserPassword,
  updateAdminUser,
} from "../actions";

type StoreOption = { id: string; name: string; dealer_group_id: string };
type GroupOption = { id: string; name: string };

export type UserDetail = {
  id: string;
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  role: string;
  status: string;
  dealer_group_id: string | null;
  created_at: string | null;
};

type Props = {
  user: UserDetail;
  groups: GroupOption[];
  stores: StoreOption[];
  assignedStoreIds: string[];
  canEdit: boolean;
  readOnlyReason?: string | null;
  isOwnerViewer: boolean;
};

function statusVariant(status: string): "success" | "warning" | "outline" {
  if (status === "active") return "success";
  if (status === "invited" || status === "requested") return "warning";
  return "outline";
}

export default function UserDetailClient({
  user,
  groups,
  stores,
  assignedStoreIds,
  canEdit,
  readOnlyReason,
  isOwnerViewer,
}: Props) {
  const displayName = formatProfileName(user.first_name, user.last_name);
  const isPlatformTarget = user.role === "platform_admin" || user.role === "owner_admin";
  const isAutoGroup = user.role === "group_admin" || user.role === "store_admin";
  const [selectedGroupId, setSelectedGroupId] = useState(user.dealer_group_id ?? groups[0]?.id ?? "");

  const groupStores = useMemo(
    () =>
      stores
        .filter((s) => s.dealer_group_id === selectedGroupId)
        .map((s) => ({ id: s.id, name: s.name })),
    [stores, selectedGroupId]
  );

  const showInviteActions =
    user.role !== "owner_admin" &&
    (canEdit || (isOwnerViewer && user.role === "platform_admin"));

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/users" className="text-xs text-muted-foreground hover:text-foreground">
          ← Back to Users
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{displayName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">{formatRoleLabel(user.role)}</Badge>
            <Badge variant={statusVariant(user.status)}>{formatStatusLabel(user.status)}</Badge>
          </div>
        </div>
      </div>

      {!canEdit ? (
        <div className="rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          {readOnlyReason || "You can view this user but cannot edit them."}
        </div>
      ) : null}

      {canEdit ? (
        <FormWithSaveToast
          action={updateAdminUser}
          className="space-y-5 rounded-lg border border-border bg-card p-5"
        >
          <input type="hidden" name="id" value={user.id} />
          <input type="hidden" name="user_id" value={user.user_id} />

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                First name
              </label>
              <Input name="first_name" defaultValue={user.first_name ?? ""} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Last name
              </label>
              <Input name="last_name" defaultValue={user.last_name ?? ""} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Email</label>
              <Input name="email" type="email" required defaultValue={user.email} />
            </div>
            <PhoneField id={`detail_${user.id}_phone`} defaultValue={user.phone ?? ""} />
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
              <select
                name="status"
                defaultValue={user.status}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="requested">Requested</option>
                <option value="invited">Invited</option>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
          </div>

          {isPlatformTarget ? <input type="hidden" name="role" value={user.role} /> : null}

          {isAutoGroup ? (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Auto group
                </label>
                <select
                  name="dealer_group_id"
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                  required
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
                key={selectedGroupId}
                stores={groupStores}
                defaultRole={user.role === "group_admin" ? "group_admin" : "store_admin"}
                defaultStoreIds={
                  selectedGroupId === user.dealer_group_id ? assignedStoreIds : []
                }
                idPrefix={`detail_${user.id}`}
              />
            </>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button type="submit" size="sm">
              Save changes
            </Button>
          </div>
        </FormWithSaveToast>
      ) : (
        <div className="space-y-3 rounded-lg border border-border bg-card p-5 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground">Phone</div>
              <div>{user.phone || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Role</div>
              <div>{formatRoleLabel(user.role)}</div>
            </div>
            {!isPlatformTarget ? (
              <div>
                <div className="text-xs text-muted-foreground">Auto group</div>
                <div>{groups.find((g) => g.id === user.dealer_group_id)?.name || "—"}</div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {showInviteActions ? (
        <div className="flex flex-wrap gap-2">
          <FormWithSaveToast action={resendAdminUserInvite} successMessage="Invite email sent">
            <input type="hidden" name="id" value={user.id} />
            <Button type="submit" size="sm" variant="outline">
              Resend invite
            </Button>
          </FormWithSaveToast>
          <FormWithSaveToast
            action={resetAdminUserPassword}
            successMessage="Password reset email sent"
          >
            <input type="hidden" name="id" value={user.id} />
            <Button type="submit" size="sm" variant="outline">
              Reset password
            </Button>
          </FormWithSaveToast>
          {canEdit ? (
            <FormWithSaveToast action={disableAdminUser} successMessage="User disabled">
              <input type="hidden" name="id" value={user.id} />
              <Button type="submit" size="sm" variant="ghost">
                Disable user
              </Button>
            </FormWithSaveToast>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
