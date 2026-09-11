"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type StoreRow = {
  id: string;
  name: string;
  isDemo: boolean;
  plan: string;
  status: string;
  statusKey: string;
  interval: string;
  priceMonthly: string;
  priceAnnual: string;
  acquire: boolean;
  trialEnds: string;
  periodEnd: string;
  importWindowEnds: string;
  activationFeePaid: boolean;
};

type Summary = {
  groupName: string;
  storeCount: number;
  analyzeCount: number;
  trialingCount: number;
  acquireCount: number;
  listMonthlyLabel: string;
  listAnnualLabel: string;
};

function statusVariant(
  key: string
): "success" | "warning" | "outline" | "destructive" {
  switch (key) {
    case "active":
      return "success";
    case "trialing":
      return "warning";
    case "past_due":
      return "destructive";
    default:
      return "outline";
  }
}

export default function BillingClient({
  summary,
  stores,
  isPlatformStaff = false,
}: {
  summary: Summary;
  stores: StoreRow[];
  isPlatformStaff?: boolean;
}) {
  return (
    <div className="space-y-5">
      <section className="app-panel p-5">
        <p className="app-kicker">Account</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
          Billing
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage Analyze subscriptions per rooftop for {summary.groupName}. Card and ACH
          self-serve checkout is coming soon — beta accounts are managed by DealerACQ.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="app-panel p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-foreground">Summary</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Live rooftops
              </dt>
              <dd className="mt-1 text-2xl font-semibold text-foreground">
                {summary.storeCount}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                On Analyze
              </dt>
              <dd className="mt-1 text-2xl font-semibold text-foreground">
                {summary.analyzeCount}
                {summary.trialingCount > 0 ? (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    ({summary.trialingCount} trial)
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Monthly list (Analyze)
              </dt>
              <dd className="mt-1 text-2xl font-semibold text-foreground">
                {summary.listMonthlyLabel}
              </dd>
              <p className="text-xs text-muted-foreground">
                Sum of Analyze store list prices
              </p>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Annual prepay (10×)
              </dt>
              <dd className="mt-1 text-2xl font-semibold text-foreground">
                {summary.listAnnualLabel}
              </dd>
              <p className="text-xs text-muted-foreground">2 months free when prepaid</p>
            </div>
          </dl>
          {summary.acquireCount > 0 ? (
            <p className="mt-4 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Acquire is enabled on {summary.acquireCount} store
              {summary.acquireCount === 1 ? "" : "s"}. Unit fees ($400/car) are billed on the
              next month&apos;s invoice for that store — currently tracked manually.
            </p>
          ) : null}
        </div>

        <div className="app-panel flex flex-col gap-3 p-5">
          <h2 className="text-sm font-semibold text-foreground">Payment actions</h2>
          <p className="text-xs text-muted-foreground">
            Self-serve payment updates will connect to Stripe here. During beta, contact
            DealerACQ to change plans or payment method.
          </p>
          <Button type="button" disabled className="justify-start">
            Update payment method
          </Button>
          <Button type="button" disabled variant="outline" className="justify-start">
            Switch to annual
          </Button>
          <Button type="button" disabled variant="outline" className="justify-start">
            Download invoices
          </Button>
          <p className="text-[11px] text-muted-foreground">Coming soon</p>
          {isPlatformStaff ? (
            <p className="mt-auto text-[11px] text-muted-foreground">
              Platform view — edit store billing on the admin group page.
            </p>
          ) : null}
        </div>
      </section>

      <section className="app-panel overflow-hidden p-0">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">Stores</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Each live rooftop is billed separately. Canceling Analyze keeps Sales Registry and
            Leaderboard on Log.
          </p>
        </div>
        {stores.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">No active stores yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Store</th>
                  <th className="px-3 py-3 font-medium">Plan</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 font-medium">Interval</th>
                  <th className="px-3 py-3 font-medium">Price</th>
                  <th className="px-3 py-3 font-medium">Acquire</th>
                  <th className="px-3 py-3 font-medium">Trial / period</th>
                  <th className="px-3 py-3 font-medium">Import window</th>
                  <th className="px-5 py-3 font-medium">Activation</th>
                </tr>
              </thead>
              <tbody>
                {stores.map((s) => (
                  <tr key={s.id} className="border-b border-border/70 last:border-0">
                    <td className="px-5 py-3 font-medium text-foreground">
                      {s.name}
                      {s.isDemo ? (
                        <Badge variant="outline" className="ml-2">
                          Demo
                        </Badge>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">{s.plan}</td>
                    <td className="px-3 py-3">
                      <Badge variant={statusVariant(s.statusKey)}>{s.status}</Badge>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{s.interval}</td>
                    <td className="px-3 py-3">
                      <div>{s.priceMonthly}/mo</div>
                      <div className="text-[11px] text-muted-foreground">
                        {s.priceAnnual}/yr
                      </div>
                    </td>
                    <td className="px-3 py-3">{s.acquire ? "On" : "Off"}</td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {s.statusKey === "trialing" ? s.trialEnds : s.periodEnd}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{s.importWindowEnds}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {s.activationFeePaid ? "Paid" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
