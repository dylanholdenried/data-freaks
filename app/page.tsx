import { Archivo, IBM_Plex_Mono, Inter } from "next/font/google";
import DealerAcqLogo from "@/components/brand/DealerAcqLogo";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-da-display",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-da-body",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-da-mono",
  display: "swap",
});

const TICKER_ITEMS = [
  { label: "2021 SILVERADO 1500 LT · ", amount: "+$4,850", days: " · 21 DAYS", up: true },
  { label: "2019 EQUINOX LT · ", amount: "+$3,975", days: " · 14 DAYS", up: true },
  { label: "2018 RAM 1500 BIG HORN · ", amount: "+$4,210", days: " · 33 DAYS", up: true },
  { label: "2022 MALIBU LT · ", amount: "−$640", days: " · 88 DAYS · RED-LIGHT", up: false },
  { label: "2020 TRAVERSE LS · ", amount: "+$3,480", days: " · 19 DAYS", up: true },
  { label: "2017 F-150 XLT · ", amount: "+$5,120", days: " · 26 DAYS", up: true },
  { label: "2019 GRAND CHEROKEE LAREDO · ", amount: "+$4,660", days: " · 17 DAYS", up: true },
  { label: "2016 CRUZE LT · ", amount: "−$1,210", days: " · 96 DAYS · RED-LIGHT", up: false },
] as const;

const PROFIT_ROWS = [
  { model: "Silverado 1500", units: "14", gross: "$4,812", turn: "22d", signal: "BUY MORE", buy: true },
  { model: "Equinox", units: "11", gross: "$3,905", turn: "17d", signal: "BUY MORE", buy: true },
  { model: "Ram 1500", units: "9", gross: "$4,196", turn: "29d", signal: "BUY MORE", buy: true },
  { model: "Grand Cherokee", units: "7", gross: "$4,540", turn: "19d", signal: "BUY MORE", buy: true },
  { model: "Malibu", units: "6", gross: "$1,120", turn: "71d", signal: "RED-LIGHT", buy: false },
  { model: "Cruze", units: "4", gross: "$680", turn: "84d", signal: "RED-LIGHT", buy: false },
] as const;

const STATS = [
  { value: "80–100", label: "Cars bought per month by the founder", blue: false },
  { value: "$3,500+", label: "Avg front + back gross per deal", blue: false },
  { value: "2 min", label: "To log a deal — managers actually do it", blue: true },
  { value: "$0", label: "To start — free sales log, forever", blue: true },
] as const;

const PROBLEM_ITEMS = [
  { ok: false, text: "Sales log lives in Excel, updated when someone remembers" },
  { ok: false, text: "Buying decisions run on gut feel and auction-lane habit" },
  { ok: false, text: "The same money-losing models get bought again and again" },
  { ok: true, text: "DealerACQ: every deal logged, graded, and turned into a buy signal" },
] as const;

const RUNGS = [
  {
    level: "Level 1 · Free",
    title: "Log",
    body: "A deal log your managers will actually use. Volume, gross, and pace by department and store — no more spreadsheet archaeology.",
    hot: false,
  },
  {
    level: "Level 2 · Software",
    title: "Analyze",
    body: "The Profit Center. Gross and turn by make, model, price band, and source. Know exactly what makes you money — and what's been quietly losing it.",
    hot: true,
  },
  {
    level: "Level 3 · Advisory",
    title: "Advise",
    body: "1-on-1 with the founder. Your historical deals loaded and decoded, and a custom buy-box built from your store's actual outcomes.",
    hot: false,
  },
  {
    level: "Level 4 · Service",
    title: "Acquire",
    body: "We buy the cars your data says to buy — sourced, purchased, and transported to your lot. Your buy-box, executed for you.",
    hot: false,
  },
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

function TickerItem({
  label,
  amount,
  days,
  up,
}: {
  label: string;
  amount: string;
  days: string;
  up: boolean;
}) {
  return (
    <span className="da-tape-item">
      {label}
      <b className={up ? "da-up" : "da-dn"}>{amount}</b>
      {days}
    </span>
  );
}

export default function LandingPage() {
  return (
    <div
      className={`da-landing ${archivo.variable} ${inter.variable} ${ibmPlexMono.variable}`}
    >
      {/* deal tape */}
      <div className="da-tape" aria-hidden="true">
        <div className="da-tape-inner">
          {TICKER_ITEMS.map((item) => (
            <TickerItem key={`a-${item.label}`} {...item} />
          ))}
          {TICKER_ITEMS.map((item) => (
            <TickerItem key={`b-${item.label}`} {...item} />
          ))}
        </div>
      </div>

      {/* nav */}
      <nav className="da-nav">
        <div className="da-wrap da-nav-in">
          <DealerAcqLogo href="/" />
          <div className="da-nav-links">
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
            <a href="#founder">Who built it</a>
          </div>
          <div className="da-nav-actions">
            <a className="da-nav-text" href="/demo">
              View Demo
            </a>
            <a className="da-nav-text" href="/login">
              Log in
            </a>
            <a className="da-btn da-btn-amber" href="/signup">
              Sign up
            </a>
          </div>
        </div>
      </nav>

      {/* hero */}
      <header className="da-wrap da-hero">
        <div>
          <div className="da-eyebrow">Acquisition intelligence for used car departments</div>
          <h1>
            Your deal log already knows <span className="da-hl">what to buy next.</span>
          </h1>
          <p className="da-sub">
            DealerACQ turns every closed deal into buying intelligence — which makes, models, and
            price bands actually gross, and which ones rot on your lot. Log deals free. Upgrade when
            you want the answers.
          </p>
          <div className="da-hero-ctas">
            <a className="da-btn da-btn-amber da-btn-lg" href="/signup">
              Start for Free
            </a>
            <a className="da-btn da-btn-ghost da-btn-lg" href="#how">
              See how it works
            </a>
          </div>
          <div className="da-micro">
            No credit card. No install. Your managers log deals —{" "}
            <b>the data does the rest.</b>
          </div>
        </div>

        <div
          className="da-term"
          role="img"
          aria-label="Profit Center preview showing gross and turn by model"
        >
          <div className="da-term-bar">
            <span className="da-term-title">PROFIT CENTER · PRE-OWNED · LAST 90 DAYS</span>
            <div className="da-term-dots">
              <span className="da-dot da-dot-a" />
              <span className="da-dot da-dot-b" />
              <span className="da-dot" />
            </div>
          </div>
          <div className="da-term-scroll">
            <table className="da-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th className="da-r">Units</th>
                  <th className="da-r">Avg Gross</th>
                  <th className="da-r">Avg Turn</th>
                  <th className="da-r">Signal</th>
                </tr>
              </thead>
              <tbody>
                {PROFIT_ROWS.map((row) => (
                  <tr key={row.model}>
                    <td>{row.model}</td>
                    <td className="da-r">{row.units}</td>
                    <td className={`da-r ${row.buy ? "da-g" : "da-b"}`}>{row.gross}</td>
                    <td className="da-r">{row.turn}</td>
                    <td className="da-r">
                      <span className={`da-tag ${row.buy ? "da-tag-buy" : "da-tag-red"}`}>
                        {row.signal}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="da-term-foot">
            <span>
              DEPT GROSS MTD: <b className="da-up">$412,380</b>
            </span>
            <span>
              AVG F+B: <b className="da-foot-text">$3,860</b>
            </span>
            <span>
              PACE: <b className="da-foot-amber">118 / 115</b>
            </span>
          </div>
        </div>
      </header>

      {/* proof strip */}
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

      {/* problem */}
      <section className="da-problem">
        <div className="da-wrap da-prob-grid">
          <div>
            <div className="da-sec-eyebrow">The problem</div>
            <h2>Most stores can tell you what they sold. Almost none can tell you what to buy.</h2>
            <p className="da-sec-sub">
              The answer is sitting in your own deal jackets — it&apos;s just trapped in a spreadsheet
              nobody analyzes.
            </p>
          </div>
          <ul className="da-prob-list">
            {PROBLEM_ITEMS.map((item) => (
              <li key={item.text}>
                <span className={item.ok ? "da-k" : "da-x"}>{item.ok ? "✓" : "✕"}</span>
                {item.text}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ladder */}
      <section id="how" className="da-wrap da-ladder">
        <div className="da-sec-eyebrow">How it works</div>
        <h2>Four levels. Each one makes the next one smarter.</h2>
        <p className="da-sec-sub">
          Start free with the log. Every deal you enter makes the analysis sharper, the buy-box
          tighter, and the buying easier to hand off.
        </p>
        <div className="da-rungs">
          {RUNGS.map((rung) => (
            <div className={`da-rung${rung.hot ? " da-rung-hot" : ""}`} key={rung.title}>
              <span className="da-rung-num">{rung.level}</span>
              <h3>{rung.title}</h3>
              <p>{rung.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* pricing */}
      <section id="pricing" className="da-pricing">
        <div className="da-wrap">
          <div className="da-sec-eyebrow">Pricing</div>
          <h2>Priced against one better buying decision a month.</h2>
          <p className="da-sec-sub">
            One extra unit at $3,500 gross pays for the software several times over. Everything is
            per rooftop, month to month.
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

      {/* founder */}
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
              multi-store group — and got tired of guessing. Every screen in this app exists because
              he needed it on a Tuesday.
            </p>
            <blockquote>
              &quot;If you know what cars make you the most money, you buy more of them. That&apos;s
              the whole app.&quot;
            </blockquote>
          </div>
        </div>
      </section>

      {/* final CTA */}
      <section className="da-final da-wrap">
        <div className="da-sec-eyebrow">Get started</div>
        <h2>Start logging deals today. Start buying smarter this quarter.</h2>
        <p className="da-sec-sub">
          Free forever for the sales log. Upgrade when your own data convinces you.
        </p>
        <a className="da-btn da-btn-amber da-btn-lg" href="/signup">
          Start for Free
        </a>
      </section>

      <footer className="da-footer">
        <div className="da-wrap da-foot-in">
          <span>© 2026 DealerACQ · dealeracq.com</span>
          <span>BUY THE RIGHT CARS. PROVE IT WITH DATA.</span>
        </div>
      </footer>
    </div>
  );
}
