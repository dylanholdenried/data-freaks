import { endImpersonationFormAction } from "@/app/admin/impersonation-actions";
import { Button } from "@/components/ui/button";
import { formatRoleLabel } from "@/lib/profile-display";

type Props = {
  displayName: string;
  role: string;
};

export default function ImpersonationBanner({ displayName, role }: Props) {
  return (
    <div className="border-b border-amber-500/40 bg-amber-500/15 text-[var(--da-text)]">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 lg:px-8">
        <p className="text-xs font-medium sm:text-sm">
          Viewing as <span className="font-semibold">{displayName}</span>
          <span className="text-[var(--da-muted)]"> · {formatRoleLabel(role)} · read-only</span>
        </p>
        <form action={endImpersonationFormAction}>
          <Button type="submit" size="sm" variant="outline">
            Exit
          </Button>
        </form>
      </div>
    </div>
  );
}
