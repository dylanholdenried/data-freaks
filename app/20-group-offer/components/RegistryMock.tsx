"use client";

import { useMemo, useState } from "react";
import { STORE_NAME, registryDeals, type DealStatus } from "../data";

const FILTERS: Array<{ id: "all" | DealStatus; label: string }> = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "delivered", label: "Delivered" },
  { id: "closed", label: "Closed" },
];

function statusClass(status: DealStatus) {
  if (status === "pending") {
    return "bg-[color-mix(in_srgb,var(--da-amber)_18%,transparent)] text-[var(--da-amber)]";
  }
  if (status === "delivered") {
    return "bg-[color-mix(in_srgb,var(--da-blue)_18%,transparent)] text-[var(--da-blue)]";
  }
  return "bg-[color-mix(in_srgb,var(--da-green)_18%,transparent)] text-[var(--da-green)]";
}

export function RegistryMock() {
  const [filter, setFilter] = useState<"all" | DealStatus>("all");

  const rows = useMemo(
    () => (filter === "all" ? registryDeals : registryDeals.filter((d) => d.status === filter)),
    [filter]
  );

  return (
    <div className="da-term">
      <div className="da-term-bar">
        <span className="da-term-title">SALES REGISTRY · {STORE_NAME.toUpperCase()}</span>
        <div className="da-term-dots">
          <span className="da-dot da-dot-a" />
          <span className="da-dot da-dot-b" />
          <span className="da-dot" />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-[var(--da-line)] px-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((item) => {
          const active = filter === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${
                active
                  ? item.id === "pending"
                    ? "bg-[var(--da-amber)] text-[#14100a]"
                    : item.id === "delivered"
                      ? "bg-[var(--da-blue)] text-white"
                      : item.id === "closed"
                        ? "bg-[var(--da-green)] text-[#0b0e13]"
                        : "bg-[#3a4252] text-white"
                  : "bg-transparent text-[var(--da-muted)]"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="da-term-scroll">
        <table className="da-table" style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th>Stock #</th>
              <th>Vehicle</th>
              <th>Dept</th>
              <th>Salesperson</th>
              <th>Source</th>
              <th>Status</th>
              <th className="da-r">Front</th>
              <th className="da-r">Back</th>
              <th className="da-r">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((deal) => (
              <tr key={deal.stock}>
                <td className="font-semibold text-[var(--da-blue)]">{deal.stock}</td>
                <td>{deal.vehicle}</td>
                <td>{deal.department}</td>
                <td>{deal.salesperson}</td>
                <td>{deal.source}</td>
                <td>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${statusClass(deal.status)}`}
                  >
                    {deal.status}
                  </span>
                </td>
                <td className="da-r">{deal.front}</td>
                <td className="da-r">{deal.back}</td>
                <td className="da-r da-g">{deal.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
