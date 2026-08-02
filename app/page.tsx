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
          <div className="da-nav-actions">
            <a className="da-nav-text" href="/demo">
              View Demo
            </a>
            <a className="da-nav-text da-nav-login" href="/login">
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

      {/*
        Soft-launch: proof strip, pricing, and founder sections archived in
        components/landing/ArchivedSalesSections.tsx — restore when selling externally.
      */}

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
