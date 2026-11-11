import type { RollupRow } from "@/lib/profit-center/aggregate";
import type { BuyBoxResult } from "@/lib/profit-center/buyBox";
import type { ProfitCenterTabId } from "@/lib/profit-center/cohort";
import { columnExtent, statusRgb } from "@/lib/profit-center/heatmap";
import { fmt$, fmtN, fmtPct } from "../format";

type Props = {
  total: RollupRow;
  filteredCount: number;
  avgTurn: number | null;
  tradePct: number | null;
  buyBox: BuyBoxResult;
  minVolume: number;
  makeRows: RollupRow[];
  financeRows: RollupRow[];
  financeTypedVolume: number;
  onOpenTab: (tab: ProfitCenterTabId) => void;
};

export default function OverviewTab({
  total,
  filteredCount,
  avgTurn,
  tradePct,
  buyBox,
  minVolume,
  makeRows,
  financeRows,
  financeTypedVolume,
  onOpenTab,
}: Props) {
  const maxMakeVol = Math.max(1, ...makeRows.map((r) => r.volume));
  const makeAgeExtent = columnExtent(makeRows.map((r) => r.avgAge));

  return (
    <div className="space-y-4">
      <div className="pc-kpi-grid">
        <div className="pc-kpi">
          <div className="pc-kpi-label">Units closed</div>
          <div className="pc-kpi-value">{fmtN(filteredCount)}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Total front</div>
          <div className="pc-kpi-value">{fmt$(total.front)}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Total back</div>
          <div className="pc-kpi-value">{fmt$(total.back)}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Avg total gross</div>
          <div className="pc-kpi-value">{fmt$(total.avgTotal)}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Avg turn</div>
          <div
            className={
              avgTurn != null && avgTurn > 45
                ? "pc-kpi-value red"
                : "pc-kpi-value"
            }
          >
            {avgTurn == null ? "—" : `${fmtN(avgTurn, 0)}d`}
          </div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Trade %</div>
          <div className="pc-kpi-value">{fmtPct(tradePct)}</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Buy signals</div>
          <div className="pc-kpi-value green">{buyBox.buys.length}</div>
          <div className="pc-kpi-sub">min {minVolume} deals</div>
        </div>
        <div className="pc-kpi">
          <div className="pc-kpi-label">Red-lights</div>
          <div className="pc-kpi-value red">{buyBox.reds.length}</div>
          <div className="pc-kpi-sub">min {minVolume} deals</div>
        </div>
      </div>

      <section className="pc-stocking">
        <div className="pc-buybox-head">
          <h2>Finance mix</h2>
          <p>
            Sold-deal performance by finance type — open Department Performance
            for the full scoreboard.
          </p>
        </div>
        {financeTypedVolume === 0 ? (
          <p className="pc-muted">No Prime / Subprime / Cash deals in this cut.</p>
        ) : (
          <div className="pc-finance-teaser">
            {financeRows.map((row) => {
              const mix =
                financeTypedVolume === 0
                  ? null
                  : (row.volume / financeTypedVolume) * 100;
              return (
                <button
                  key={row.key}
                  type="button"
                  className="pc-finance-teaser-card"
                  onClick={() => onOpenTab("department")}
                >
                  <div className="pc-finance-teaser-label">{row.label}</div>
                  <dl className="pc-finance-teaser-list">
                    <div>
                      <dt>Total deals</dt>
                      <dd>{fmtN(row.volume)}</dd>
                    </div>
                    <div>
                      <dt>Deal %</dt>
                      <dd>{fmtPct(mix)}</dd>
                    </div>
                    <div>
                      <dt>Avg front</dt>
                      <dd>{fmt$(row.avgFront)}</dd>
                    </div>
                    <div>
                      <dt>Avg back</dt>
                      <dd>{fmt$(row.avgBack)}</dd>
                    </div>
                    <div>
                      <dt>Avg total</dt>
                      <dd>{fmt$(row.avgTotal)}</dd>
                    </div>
                    <div>
                      <dt>Avg turn</dt>
                      <dd>
                        {row.avgAge == null ? "—" : `${fmtN(row.avgAge, 0)}d`}
                      </dd>
                    </div>
                  </dl>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="pc-chart">
        <div className="pc-chart-head">
          <div>
            <h3>By make</h3>
            <p>count vs avg turn — long and slow is the red flag</p>
          </div>
        </div>
        {makeRows.length === 0 ? (
          <p className="pc-muted">No deals to chart.</p>
        ) : (
          makeRows.slice(0, 12).map((row) => {
            const widthPct = Math.max(8, (row.volume / maxMakeVol) * 100);
            let t = 0.5;
            if (makeAgeExtent && row.avgAge != null) {
              const { min, max } = makeAgeExtent;
              if (max !== min) {
                t = 1 - (row.avgAge - min) / (max - min);
              }
            }
            const color = statusRgb(t);
            return (
              <div key={row.key} className="pc-bar-row">
                <div className="pc-bar-label" title={row.label}>
                  {row.label}
                </div>
                <div className="pc-bar-track">
                  <div
                    className="pc-bar-fill"
                    style={{ width: `${widthPct}%`, background: color }}
                  >
                    {row.volume}
                  </div>
                </div>
                <div className="pc-bar-stats" style={{ color }}>
                  {fmtN(row.avgAge, 0)}d avg · {fmt$(row.avgTotal)}
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
