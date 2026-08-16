"use client";

import { cn } from "@/lib/utils";
import {
  MONTH_NAMES,
  STORE_NAME,
  dashboardPace as store,
  departmentCards,
  type DashboardDeptCard,
} from "../data";

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function PaceBar({
  sold,
  goal,
  paceLineToday,
  compact = false,
}: {
  sold: number;
  goal: number;
  paceLineToday: number;
  compact?: boolean;
}) {
  const soldPct = Math.min(100, (sold / goal) * 100);
  const pacePct = Math.min(100, (paceLineToday / goal) * 100);

  return (
    <div className="dash-vol-bar">
      <div
        className={cn(
          "dash-pace-track",
          compact ? "dash-pace-track-compact" : "dash-pace-track-store"
        )}
      >
        <div className="dash-pace-fill" style={{ width: `${soldPct}%` }} />
        <div className="dash-pace-marker" style={{ left: `${pacePct}%` }} />
        <div className="dash-goal-tick" />
      </div>
      <div className="dash-pace-legend">
        <span>
          <i className="dash-leg-sold" />
          Sold
        </span>
        <span>
          <i className="dash-leg-pace" />
          Target Pace
        </span>
        <span>
          <i className="dash-leg-goal" />
          Goal
        </span>
      </div>
    </div>
  );
}

function StatusMark({ behind }: { behind: boolean }) {
  if (behind) {
    return (
      <span className="dash-status-text is-behind">
        <span aria-hidden>▼</span> Behind pace
      </span>
    );
  }
  return (
    <span className="dash-status-text is-on-track">
      <span aria-hidden>▲</span> On track
    </span>
  );
}

function GrossTable({
  front,
  back,
  total,
  avgFront,
  avgBack,
  avgTotal,
}: {
  front: number;
  back: number;
  total: number;
  avgFront: number;
  avgBack: number;
  avgTotal: number;
}) {
  const grossMax = Math.max(Math.abs(total), Math.abs(front), Math.abs(back), 1);
  const rows = [
    { key: "total", label: "Total", mtd: total, avg: avgTotal },
    { key: "front", label: "Front", mtd: front, avg: avgFront },
    { key: "back", label: "Back", mtd: back, avg: avgBack },
  ] as const;

  return (
    <div className="dash-card-gross">
      <div className="dash-gross-table-head">
        <span className="dash-mini-label">Gross</span>
        <span className="dash-mini-label">MTD</span>
        <span className="dash-mini-label">Avg / deal</span>
      </div>
      {rows.map((row) => {
        const width = Math.min(100, (Math.abs(row.mtd) / grossMax) * 100);
        const tone = row.mtd >= 0 ? "is-good" : "is-warn";
        const avgTone = row.avg >= 0 ? "is-good" : "is-warn";
        return (
          <div key={row.key} className="dash-gross-row">
            <div className="dash-gross-row-label">
              <span>{row.label}</span>
              <div className="dash-gross-row-track">
                <div className={cn("dash-gross-row-fill", tone)} style={{ width: `${width}%` }} />
              </div>
            </div>
            <span className={cn("dash-gross-row-value", tone)}>{money(row.mtd)}</span>
            <span className={cn("dash-gross-row-value", avgTone)}>{money(row.avg)}</span>
          </div>
        );
      })}
    </div>
  );
}

function DepartmentCard({ dept }: { dept: DashboardDeptCard }) {
  const behind = dept.vsPace < 0;
  const projTone = dept.projVsGoal >= 0 ? "good" : "warn";

  return (
    <div className="dash-card">
      <div className="dash-card-head">
        <p className="dash-card-title">{dept.name}</p>
        <StatusMark behind={behind} />
      </div>

      <div className="dash-sold-proj">
        <div className="dash-sold-proj-main">
          <span className="dash-sold-proj-num">{dept.sold}</span>
          <span
            className={cn(
              "dash-sold-proj-num",
              projTone === "good" && "is-good",
              projTone === "warn" && "is-warn"
            )}
          >
            {dept.pace}
          </span>
          <span
            className={cn(
              "dash-sold-proj-delta",
              dept.projVsGoal >= 0 ? "is-good" : "is-warn"
            )}
          >
            {signed(dept.projVsGoal)}
          </span>
          <span className="dash-sold-proj-label">Sold MTD</span>
          <span className="dash-sold-proj-label">Pace</span>
          <span className="dash-sold-proj-label dash-sold-proj-label-spacer" />
        </div>
        <div className="dash-sold-proj-side">
          <span className="dash-view-deals">View all deals →</span>
          {dept.pending > 0 ? (
            <span className="dash-awaiting">{dept.pending} Awaiting Delivery</span>
          ) : null}
        </div>
      </div>

      <PaceBar sold={dept.sold} goal={dept.goal} paceLineToday={dept.paceLineToday} compact />

      <div className="dash-mini-row">
        <div className="dash-mini">
          <span className="dash-mini-value is-blue">{dept.needPerDay}</span>
          <span className="dash-mini-label">Need / day</span>
        </div>
        <div className="dash-mini">
          <span className="dash-mini-value">{dept.toGo}</span>
          <span className="dash-mini-label">To go</span>
        </div>
        <div className="dash-mini">
          <span className={cn("dash-mini-value", dept.vsPace >= 0 ? "is-good" : "is-warn")}>
            {signed(dept.vsPace)}
          </span>
          <span className="dash-mini-label">Vs pace</span>
        </div>
      </div>

      <GrossTable
        front={dept.front}
        back={dept.back}
        total={dept.total}
        avgFront={dept.avgFront}
        avgBack={dept.avgBack}
        avgTotal={dept.avgTotal}
      />

      <div className="dash-card-mix">
        <p className="dash-finance-line">{dept.financeLine}</p>
        <p className="dash-mini-label dash-acq-label">Acquisition sources</p>
        <div className="dash-acq-list">
          {dept.sources.map((source) => (
            <div key={source.name} className="dash-acq-row">
              <span className="dash-acq-name">{source.name}</span>
              <div className="dash-acq-track">
                <div style={{ width: `${source.width}%` }} />
              </div>
              <span className="dash-acq-value">{source.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DashboardMock() {
  const projBehind = store.projVsGoal < 0;
  const paceBehind = store.vsPace < 0;

  return (
    <div className="da-term">
      <div className="da-term-bar">
        <span className="da-term-title">
          SALES COMMAND · {STORE_NAME.toUpperCase()} · {store.monthLabel.toUpperCase()}
        </span>
        <div className="da-term-dots">
          <span className="da-dot da-dot-a" />
          <span className="da-dot da-dot-b" />
          <span className="da-dot" />
        </div>
      </div>

      <div className="pc-command dash-tv space-y-5 !m-0 min-h-0 !px-3 !py-4 sm:!px-5">
        <header className="pc-head dash-tv-head">
          <div>
            <p className="pc-kicker">Sales command</p>
            <p className="pc-title">{store.monthLabel}</p>
            <p className="pc-meta">
              Day {store.workingDaysUsed} of {store.workingDaysTotal} working days ·{" "}
              {store.remaining} remaining · live {store.clock}
            </p>
            <div className="dash-tv-selects dash-tv-selects-inline">
              <label>
                <span>Month</span>
                <select value={store.month} onChange={() => undefined} aria-label="Month">
                  {MONTH_NAMES.map((name, index) => (
                    <option key={name} value={index + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Year</span>
                <select value={store.year} onChange={() => undefined} aria-label="Year">
                  <option value={store.year}>{store.year}</option>
                </select>
              </label>
              <button type="button" className="pc-pill is-soft is-active">
                Current Month
              </button>
            </div>
          </div>

          <div className="dash-tv-controls">
            <div className="pc-store-pills" role="group" aria-label="Store">
              <button type="button" className="pc-pill is-active">
                {STORE_NAME.toUpperCase()}
              </button>
            </div>

            <div className="dash-agg">
              <div className="dash-agg-item">
                <span className="dash-agg-label">Store MTD</span>
                <span className="dash-agg-value">
                  {store.sold}
                  <span className="dash-agg-muted"> / {store.goal}</span>
                </span>
              </div>
              <div className="dash-agg-item">
                <span className="dash-agg-label">Projected</span>
                <span className={cn("dash-agg-value", projBehind ? "is-warn" : "is-good")}>
                  {store.pace}
                  <span className="dash-agg-delta"> {signed(store.projVsGoal)}</span>
                </span>
              </div>
              <div className="dash-agg-item">
                <span className="dash-agg-label">Gross</span>
                <span className="dash-agg-value">{money(store.gross)}</span>
              </div>
            </div>
          </div>
        </header>

        <div className="dash-store-totals" aria-label="Store totals">
          <p className="dash-section-label">Store totals</p>
          <div className="dash-store-stack">
            <article className="dash-store-row">
              <div className="dash-store-row-identity">
                <p className="dash-store-row-name">{STORE_NAME.toUpperCase()}</p>
                <div className="dash-store-row-status">
                  <StatusMark behind={paceBehind} />
                  <span className="dash-store-awaiting">
                    {store.pending} Awaiting delivery
                  </span>
                </div>
              </div>

              <div className="dash-store-row-sold">
                <div className="dash-sold-proj-main dash-sold-proj-main-inline">
                  <span className="dash-sold-proj-num">{store.sold}</span>
                  <span className={cn("dash-sold-proj-num", projBehind ? "is-warn" : "is-good")}>
                    {store.pace}
                  </span>
                  <span className={cn("dash-sold-proj-delta", projBehind ? "is-warn" : "is-good")}>
                    {signed(store.projVsGoal)}
                  </span>
                  <span className="dash-sold-proj-label">Sold MTD</span>
                  <span className="dash-sold-proj-label">Pace</span>
                  <span className="dash-sold-proj-label dash-sold-proj-label-spacer" />
                </div>
              </div>

              <div className="dash-store-row-pace">
                <PaceBar
                  sold={store.sold}
                  goal={store.goal}
                  paceLineToday={store.paceLineToday}
                />
              </div>

              <div className="dash-store-row-metrics">
                <div className="dash-mini">
                  <span className="dash-mini-value is-blue">{store.needPerDay}</span>
                  <span className="dash-mini-label">Need / day</span>
                </div>
                <div className="dash-mini">
                  <span className="dash-mini-value">{store.toGo}</span>
                  <span className="dash-mini-label">To go</span>
                </div>
                <div className="dash-mini">
                  <span className={cn("dash-mini-value", store.vsPace >= 0 ? "is-good" : "is-warn")}>
                    {signed(store.vsPace)}
                  </span>
                  <span className="dash-mini-label">Vs pace</span>
                </div>
                <div className="dash-mini">
                  <span className="dash-mini-value is-good">{money(store.gross)}</span>
                  <span className="dash-mini-label">Gross MTD</span>
                </div>
              </div>
            </article>
          </div>
        </div>

        <div className="dash-card-grid">
          {departmentCards.map((dept) => (
            <DepartmentCard key={dept.name} dept={dept} />
          ))}
        </div>
      </div>
    </div>
  );
}
