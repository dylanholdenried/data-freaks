/**
 * Soft-launch archive — sales-facing homepage sections.
 *
 * Hidden while activating Jim Butler Auto Group (free internal client).
 * To restore later, import these into `app/page.tsx` and render:
 *   - `<ArchivedProofStrip />` after the hero
 *   - `<ArchivedPricingSection />` after the "How it works" ladder
 *   - `<ArchivedFounderSection />` after pricing
 * Also re-add nav links: How it works → #how, Pricing → #pricing, Who built it → #founder
 */

const STATS = [
  { value: "80–100", label: "Cars bought per month by the founder", blue: false },
  { value: "$3,500+", label: "Avg front + back gross per deal", blue: false },
  { value: "2 min", label: "To log a deal — managers actually do it", blue: true },
  { value: "$0", label: "To start — free sales log, forever", blue: true },
] as const;

const PLANS = [
  {
    name: "Log",
    for: "The free sales log",
    price: "$0",
    priceSuffix: " /forever",
    sub: "Per rooftop",
    featured: false,
    features: [
      { text: "Full deal log & lifecycle", dim: false },
      { text: "Volume & gross by department", dim: false },
      { text: "Monthly pace tracking", dim: false },
      { text: "Unlimited users", dim: false },
      { text: "— Profit Center locked", dim: true },
    ],
    cta: "Start for Free",
    href: "/signup",
    amber: false,
  },
  {
    name: "Analyze",
    for: "The profit center",
    price: "$749",
    priceSuffix: " /mo",
    sub: "Per rooftop · $549 each additional",
    featured: true,
    features: [
      { text: "Everything in Log", dim: false },
      { text: "Gross & turn by make, model, price band", dim: false },
      { text: "Acquisition source performance", dim: false },
      { text: "Salesperson leaderboards", dim: false },
      { text: "Red-light list — stop buying losers", dim: false },
    ],
    cta: "Start for Free",
    href: "/signup",
    amber: true,
  },
  {
    name: "Advise",
    for: "Founder-led consulting",
    price: "$2,500",
    priceSuffix: " /mo",
    sub: "3-month minimum · includes Analyze",
    featured: false,
    features: [
      { text: "Monthly 1-on-1 working session", dim: false },
      { text: "Custom buy-box built from your data", dim: false },
      { text: "Historical deal backfill (from $500)", dim: false },
      { text: "Direct line to the founder", dim: false },
    ],
    cta: "Request Advise",
    href: "mailto:dylan@dealeracq.com",
    amber: false,
  },
  {
    name: "Acquire",
    for: "We buy the cars for you",
    price: "Per unit",
    priceSuffix: "",
    sub: "By invitation · Analyze customers",
    featured: false,
    features: [
      { text: "Buy-box executed by a pro buyer", dim: false },
      { text: "Auction, trade & private-party sourcing", dim: false },
      { text: "Transport arranged to your lot", dim: false },
      { text: "Quoted per unit purchased", dim: false },
    ],
    cta: "Talk to us",
    href: "mailto:dylan@dealeracq.com",
    amber: false,
  },
] as const;

const FOUNDER_ROWS = [
  { k: "BUILT BY", v: "A working car buyer & former UCM", amber: false },
  { k: "CURRENT ROLE", v: "Acquisition lead, multi-store auto group", amber: false },
  { k: "MONTHLY VOLUME", v: "80–100 units bought", amber: true },
  { k: "AVG DEAL", v: "$3,500+ front + back", amber: true },
  { k: "CHANNELS", v: "Auction · Trade · Private party · Fleet", amber: false },
  { k: "BUILT WITH", v: "The same data it sells you", amber: false },
] as const;

/** Proof strip with founder volume / pricing hooks — was below the hero. */
export function ArchivedProofStrip() {
  return (
    <div className="da-strip">
      <div className="da-wrap da-strip-in">
        {STATS.map((stat) => (
          <div className="da-stat" key={stat.label}>
            <div className={`da-stat-n${stat.blue ? " da-stat-bl" : ""}`}>{stat.value}</div>
            <div className="da-stat-l">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Pricing tier cards — was after the How it works ladder. */
export function ArchivedPricingSection() {
  return (
    <section id="pricing" className="da-pricing">
      <div className="da-wrap">
        <div className="da-sec-eyebrow">Pricing</div>
        <h2>Priced against one better buying decision a month.</h2>
        <p className="da-sec-sub">
          One extra unit at $3,500 gross pays for the software several times over. Everything is per
          rooftop, month to month.
        </p>
        <div className="da-plans">
          {PLANS.map((plan) => (
            <div className={`da-plan${plan.featured ? " da-plan-feat" : ""}`} key={plan.name}>
              <div className="da-p-name">{plan.name}</div>
              <div className="da-p-for">{plan.for}</div>
              <div className="da-price">
                {plan.price}
                {plan.priceSuffix ? <small>{plan.priceSuffix}</small> : null}
              </div>
              <div className="da-p-sub">{plan.sub}</div>
              <ul className="da-feat-list">
                {plan.features.map((feature) =>
                  feature.dim ? (
                    <li className="da-feat-dim" key={feature.text}>
                      {feature.text}
                    </li>
                  ) : (
                    <li key={feature.text}>
                      <span className="da-c">✓</span> {feature.text}
                    </li>
                  )
                )}
              </ul>
              <a
                className={`da-btn ${plan.amber ? "da-btn-amber" : "da-btn-ghost"}`}
                href={plan.href}
              >
                {plan.cta}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Founder / who-built-it section — was after pricing. */
export function ArchivedFounderSection() {
  return (
    <section id="founder" className="da-wrap da-founder">
      <div className="da-founder-grid">
        <div className="da-founder-card">
          {FOUNDER_ROWS.map((row) => (
            <div className="da-founder-row" key={row.k}>
              <span className="da-founder-k">{row.k}</span>
              <span className={`da-founder-v${row.amber ? " da-am" : ""}`}>{row.v}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="da-sec-eyebrow">Who built it</div>
          <h2>Built by a buyer, not a software company.</h2>
          <p className="da-sec-sub">
            DealerACQ was built by a working acquisition manager who buys 80–100 cars a month for a
            multi-store group — and got tired of guessing. Every screen in this app exists because he
            needed it on a Tuesday.
          </p>
          <blockquote>
            &quot;If you know what cars make you the most money, you buy more of them. That&apos;s
            the whole app.&quot;
          </blockquote>
        </div>
      </div>
    </section>
  );
}
