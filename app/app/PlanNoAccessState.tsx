import Link from "next/link";
import { Button } from "@/components/ui/button";
import { isPlatformStaff } from "@/lib/roles";

export default function PlanNoAccessState({
  title,
  description,
  requiredPlan,
  viewerRole,
}: {
  title: string;
  description: string;
  requiredPlan: "Analyze" | "Acquire";
  viewerRole?: string | null;
}) {
  const canManageBilling =
    viewerRole === "group_admin" || isPlatformStaff(viewerRole);
  const planLabel = requiredPlan === "Acquire" ? "Acquire addon" : "Analyze plan";

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 py-12">
      <section className="app-panel p-6">
        <p className="app-kicker">{requiredPlan}</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        <div className="mt-4 space-y-3 text-sm text-muted-foreground">
          <p>{description}</p>
          <p>
            This feature is included with the{" "}
            <span className="font-semibold text-foreground">{planLabel}</span>.
          </p>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/app/dashboard">Back to Dashboard</Link>
          </Button>
          {canManageBilling ? (
            <Button asChild size="sm">
              <Link href="/app/billing">Go to Billing</Link>
            </Button>
          ) : (
            <Button asChild size="sm" variant="secondary">
              <a href="mailto:dylan@dealeracq.com">Ask your group admin</a>
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
