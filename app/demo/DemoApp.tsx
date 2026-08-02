"use client";

import { useMemo, useState } from "react";
import { Archivo, IBM_Plex_Mono, Inter } from "next/font/google";
import DealerAcqLogo from "@/components/brand/DealerAcqLogo";
import { getAcqAutoGroupFixture, DEMO_TODAY } from "@/lib/demo/acq-auto-group";
import { DemoDashboard } from "./DemoDashboard";
import { DemoRegistry } from "./DemoRegistry";
import { DemoProfitCenter } from "./DemoProfitCenter";

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

type Tab = "dashboard" | "registry" | "profit";

const TABS: { id: Tab; label: string; kicker: string }[] = [
  { id: "dashboard", label: "Dashboard", kicker: "Command center" },
  { id: "registry", label: "Sales Registry", kicker: "Full deal log" },
  { id: "profit", label: "Profit Center", kicker: "Buy intelligence" },
];

const TICKER = [
  ["2024 SILVERADO 1500", "+$4,820", true],
  ["2023 TELLURIDE", "+$4,110", true],
  ["2019 MALIBU", "−$640", false],
  ["2025 SPORTAGE", "+$3,240", true],
  ["2018 CRUZE", "−$1,080", false],
  ["2022 EQUINOX", "+$3,760", true],
] as const;

export default function DemoApp() {
  const fixture = useMemo(() => getAcqAutoGroupFixture(), []);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [storeId, setStoreId] = useState<string>("all");
  const [month, setMonth] = useState(7); // July 2026 — matches DEMO_TODAY

  const storeLabel =
    storeId === "all"
      ? "Both stores"
      : fixture.stores.find((s) => s.id === storeId)?.name ?? "Store";

  return (
    <div
      className={`da-landing da-demo-page ${archivo.variable} ${inter.variable} ${ibmPlexMono.variable}`}
    >
      <div className="da-tape" aria-hidden="true">
        <div className="da-tape-inner">
          {[...TICKER, ...TICKER].map(([vehicle, gross, up], i) => (
            <span className="da-tape-item" key={`${vehicle}-${i}`}>
              {vehicle} · <b className={up ? "da-up" : "da-dn"}>{gross}</b> · DEMO DATA
            </span>
          ))}
        </div>
      </div>

      <nav className="da-nav">
        <div className="da-wrap da-nav-in">
          <DealerAcqLogo href="/" />
          <div className="da-nav-actions">
            <a className="da-nav-text da-nav-current" href="/demo" aria-current="page">
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

      <div className="da-demo-layout">
        <aside className="da-demo-sidebar">
          <div className="da-demo-brand">
            <div className="da-demo-kicker">Demo environment</div>
            <div className="da-demo-group">{fixture.groupName}</div>
            <div className="da-demo-sub">
              {fixture.stores.map((s) => s.name).join(" · ")}
            </div>
            <div className="da-demo-badge">READ-ONLY · SAMPLE DATA</div>
          </div>

          <nav className="da-demo-tabs" aria-label="Demo views">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`da-demo-tab${tab === t.id ? " is-active" : ""}`}
                onClick={() => setTab(t.id)}
              >
                <span className="da-demo-tab-kicker">{t.kicker}</span>
                <span className="da-demo-tab-label">{t.label}</span>
              </button>
            ))}
          </nav>

          <div className="da-demo-controls">
            <label>
              <span>Store</span>
              <select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                <option value="all">Both stores</option>
                {fixture.stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Month (2026)</span>
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {new Date(2026, m - 1, 1).toLocaleString("en-US", { month: "long" })}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="da-demo-side-note">
            Frozen demo date: <b>{DEMO_TODAY}</b>
            <br />
            {fixture.deals.length.toLocaleString()} sample deals across 2026
          </div>
        </aside>

        <main className="da-demo-main">
          <header className="da-demo-main-head">
            <div>
              <div className="da-sec-eyebrow">
                {TABS.find((t) => t.id === tab)?.kicker}
              </div>
              <h1>{TABS.find((t) => t.id === tab)?.label}</h1>
              <p>
                {fixture.groupName} · {storeLabel} ·{" "}
                {new Date(2026, month - 1, 1).toLocaleString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
            <div className="da-demo-mobile-tabs">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={tab === t.id ? "is-active" : ""}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </header>

          {tab === "dashboard" && (
            <DemoDashboard fixture={fixture} storeId={storeId} month={month} />
          )}
          {tab === "registry" && (
            <DemoRegistry fixture={fixture} storeId={storeId} month={month} />
          )}
          {tab === "profit" && (
            <DemoProfitCenter fixture={fixture} storeId={storeId} month={month} />
          )}
        </main>
      </div>

      <footer className="da-footer">
        <div className="da-wrap da-foot-in">
          <span>© 2026 DealerACQ · Demo data is fictional</span>
          <span>
            <a href="/signup">Start for Free →</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
