"use client";

import { useEffect, useState } from "react";
import { DashboardMock } from "./DashboardMock";
import { InventoryMock } from "./InventoryMock";
import { ProfitCenterMock } from "./ProfitCenterMock";
import { RegistryMock } from "./RegistryMock";

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "registry", label: "Sales Registry" },
  { id: "profit", label: "Profit Center" },
  { id: "inventory", label: "Inventory Command" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const CAPTIONS: Record<TabId, string> = {
  dashboard:
    "Sold vs. goal, gross, and pace against a real working-day calendar — live, not at month end.",
  registry:
    "Every deal logged in about two minutes. The full jacket gets completed at close, so logging never slows the desk.",
  profit:
    "Your own closed deals, sliced by make, model, price band, odometer, truck class, and source — not somebody's market report.",
  inventory: "Every Monday the system hands us the list. Every unit gets an owner, an action, and a deadline.",
};

export function AppTour() {
  const [tab, setTab] = useState<TabId>("dashboard");

  useEffect(() => {
    const html = document.documentElement;
    const previous = html.style.scrollBehavior;
    html.style.scrollBehavior = "smooth";
    return () => {
      html.style.scrollBehavior = previous;
    };
  }, []);

  return (
    <section id="screens" className="da-wrap scroll-mt-[80px]">
      <div className="da-sec-eyebrow">How we use it</div>
      <h2>The same screens we run the rooftop on.</h2>
      <p className="da-sec-sub">
        Fictional numbers for Demo Motors. Tap the tabs — this is the daily rhythm on the desk.
      </p>

      <div className="mt-8 -mx-1 flex gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              aria-pressed={active}
              className={`whitespace-nowrap rounded-full border px-4 py-2 text-[13px] font-bold tracking-wide transition-colors [font-family:var(--da-display)] ${
                active
                  ? "border-[var(--da-amber)] bg-[var(--da-amber)] text-[#14100a]"
                  : "border-[var(--da-line)] bg-transparent text-[var(--da-muted)]"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        {tab === "dashboard" ? <DashboardMock /> : null}
        {tab === "registry" ? <RegistryMock /> : null}
        {tab === "profit" ? <ProfitCenterMock /> : null}
        {tab === "inventory" ? <InventoryMock /> : null}
      </div>

      <p className="da-micro mt-4">{CAPTIONS[tab]}</p>
    </section>
  );
}
