import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function AcquireNoAccessState() {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 py-12">
      <section className="app-panel p-6">
        <p className="app-kicker">Acquire addon</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
          Acquire
        </h1>
        <div className="mt-4 space-y-3 text-sm text-muted-foreground">
          <p>
            Purchase pipeline and acquisition performance tracking is available as an
            Acquire addon for your Auto Group.
          </p>
          <p>
            Contact DealerACQ to enable Acquire for your stores.
          </p>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/app/dashboard">Back to Dashboard</Link>
          </Button>
          <Button asChild size="sm">
            <a href="mailto:dylan@dealeracq.com">Request Acquire</a>
          </Button>
        </div>
      </section>
    </div>
  );
}
