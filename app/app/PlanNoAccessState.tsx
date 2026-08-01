import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function PlanNoAccessState({
  title,
  description,
  requiredPlan,
}: {
  title: string;
  description: string;
  requiredPlan: "Analyze" | "Advise";
}) {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 py-12">
      <section className="app-panel p-6">
        <p className="app-kicker">{requiredPlan} plan</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        <div className="mt-4 space-y-3 text-sm text-muted-foreground">
          <p>{description}</p>
          <p>
            This feature is included on the{" "}
            <span className="font-semibold text-foreground">{requiredPlan}</span> plan.
          </p>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/app/dashboard">Back to Dashboard</Link>
          </Button>
          <Button asChild size="sm">
            <a href="mailto:dylan@dealeracq.com">Request upgrade</a>
          </Button>
        </div>
      </section>
    </div>
  );
}
