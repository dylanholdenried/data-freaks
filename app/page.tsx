import { ArrowRight, BarChart3, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    title: "Sales log that actually gets used",
    body: "Clean, dealership-friendly entry screens with split deals, trades, and gross visibility for admins."
  },
  {
    title: "Booked vs closed, at a glance",
    body: "See booked volume, closed volume, and gross pace against your working-day calendar in seconds."
  },
  {
    title: "Acquisition intelligence, not a DMS",
    body: "Built for buyers and operators. No inventory management, no desking, no CRM bloat."
  }
];

export default function LandingPage() {
  return (
    <div className="bg-gradient-to-b from-slate-50 to-white">
      <header className="border-b border-border bg-white/70 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold">
              DF
            </div>
            <span className="text-sm font-semibold tracking-tight">Data Freaks</span>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <a href="/demo" className="text-muted-foreground hover:text-foreground">
              View Demo
            </a>
            <a href="/signup" className="text-muted-foreground hover:text-foreground">
              Sign up
            </a>
            <a href="/login" className="text-muted-foreground hover:text-foreground">
              Log in
            </a>
          </nav>
        </div>
      </header>

      <section className="container flex flex-col gap-10 py-12 md:flex-row md:items-center md:py-20">
        <div className="flex-1 space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="h-3 w-3" />
            Built for dealer groups that live in the numbers
          </div>
          <h1 className="max-w-xl text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            Turn your sales log into{" "}
            <span className="text-primary">real acquisition intelligence</span>.
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">
            Data Freaks gives dealer groups a clean, modern sales log with booked vs closed visibility,
            gross pace, and salesperson leaderboards – without becoming another DMS, CRM, or desking tool.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <a href="/demo" className="flex items-center gap-2">
                View Demo
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="/signup" className="flex items-center gap-2">
                Sign up
              </a>
            </Button>
            <button className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              Book a call (coming soon)
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <div className="inline-flex items-center gap-1">
              <ShieldCheck className="h-3 w-3 text-primary" />
              Approval-gated access
            </div>
            <div className="inline-flex items-center gap-1">
              <BarChart3 className="h-3 w-3 text-primary" />
              Built for multi-store groups
            </div>
          </div>
        </div>

        <div className="flex-1">
          <Card className="card-shadow">
            <CardContent className="p-5">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-primary">
                Live preview · Demo data
              </p>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-[11px] text-muted-foreground">Booked Volume</div>
                  <div className="mt-1 text-lg font-semibold">87</div>
                  <div className="mt-1 text-[11px] text-emerald-600">Pace +9 vs plan</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-[11px] text-muted-foreground">Closed Gross</div>
                  <div className="mt-1 text-lg font-semibold">$423,750</div>
                  <div className="mt-1 text-[11px] text-emerald-600">Pace 112%</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-[11px] text-muted-foreground">Working Days</div>
                  <div className="mt-1 text-lg font-semibold">14 / 26</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">12 days remaining</div>
                </div>
              </div>
              <div className="mt-4 rounded-lg border border-dashed border-border bg-white p-3">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-medium">Salesperson leaderboard</span>
                  <span className="text-[11px] text-muted-foreground">Month-to-date</span>
                </div>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Lopez</span>
                    <span className="text-muted-foreground">18 units · $92k gross</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Nguyen</span>
                    <span className="text-muted-foreground">15 units · $81k gross</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Patel</span>
                    <span className="text-muted-foreground">13 units · $74k gross</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="border-t border-border bg-white py-10">
        <div className="container grid gap-6 md:grid-cols-[2fr,3fr]">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">A plan that matches your group.</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Start with a focused sales log, then layer on KPI analytics and advisory support as you&apos;re
              ready.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold">Free</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sales log only for one group. Volume, gross, pace, and leaderboards.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold">Paid</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Full KPI analytics, export-ready tables, and cross-store views.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold">Premium</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Analytics + consulting, with future AI-assisted acquisition recommendations.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-slate-50 py-10">
        <div className="container grid gap-4 md:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="space-y-2">
              <h3 className="text-sm font-semibold">{f.title}</h3>
              <p className="text-xs text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

