"use client";

import { useState } from "react";
import { STORE_NAME, profitRows, type ProfitSignal } from "../data";

function signalClass(signal: ProfitSignal) {
  if (signal === "BUY MORE") return "da-tag da-tag-buy";
  if (signal === "RED-LIGHT") return "da-tag da-tag-red";
  return "da-tag da-tag-watch";
}

export function ProfitCenterMock() {
  const [selected, setSelected] = useState(profitRows[0].model);
  const row = profitRows.find((r) => r.model === selected) ?? profitRows[0];

  return (
    <div className="da-term">
      <div className="da-term-bar">
        <span className="da-term-title">
          PROFIT CENTER · {STORE_NAME.toUpperCase()} · PRE-OWNED
        </span>
        <div className="da-term-dots">
          <span className="da-dot da-dot-a" />
          <span className="da-dot da-dot-b" />
          <span className="da-dot" />
        </div>
      </div>

      <div className="da-term-scroll">
        <table className="da-table" style={{ minWidth: 780 }}>
          <thead>
            <tr>
              <th>Model</th>
              <th className="da-r">Units</th>
              <th className="da-r">Avg Front</th>
              <th className="da-r">Avg Back</th>
              <th className="da-r">Avg Total</th>
              <th className="da-r">Days</th>
              <th className="da-r">Trade %</th>
              <th className="da-r">Signal</th>
            </tr>
          </thead>
          <tbody>
            {profitRows.map((item) => {
              const active = item.model === selected;
              return (
                <tr
                  key={item.model}
                  onClick={() => setSelected(item.model)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelected(item.model);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-pressed={active}
                  className="cursor-pointer"
                  style={{
                    background: active ? "rgba(255, 176, 32, 0.08)" : undefined,
                    outline: active ? "1px solid rgba(255, 176, 32, 0.35)" : undefined,
                    outlineOffset: -1,
                  }}
                >
                  <td className="font-semibold">{item.model}</td>
                  <td className="da-r">{item.units}</td>
                  <td className="da-r">{item.front}</td>
                  <td className="da-r">{item.back}</td>
                  <td className={`da-r ${item.signal === "RED-LIGHT" ? "da-b" : "da-g"}`}>
                    {item.total}
                  </td>
                  <td className="da-r">{item.days}</td>
                  <td className="da-r">{item.tradePct}</td>
                  <td className="da-r">
                    <span className={signalClass(item.signal)}>{item.signal}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="da-term-foot">
        <span>
          <b className="da-foot-amber">{row.model}.</b> {row.takeaway}
        </span>
      </div>
    </div>
  );
}
