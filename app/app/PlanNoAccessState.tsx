import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-600">
          <p>{description}</p>
          <p>
            This feature is included on the{" "}
            <span className="font-semibold text-slate-900">{requiredPlan}</span> plan.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/app/dashboard">Back to Dashboard</Link>
            </Button>
            <Button asChild size="sm">
              <a href="mailto:dylan@dealeracq.com">Request upgrade</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
