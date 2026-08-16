import { STORE_NAME, hotListUnits, inventoryChips } from "../data";

function actionClass(action: string) {
  if (action === "Auction run") return "da-tag da-tag-red";
  if (action === "Transfer") return "da-tag da-tag-watch";
  return "da-tag da-tag-buy";
}

function ageClass(days: number) {
  if (days >= 75) return "da-b";
  if (days >= 60) return "da-foot-amber";
  return "da-g";
}

export function InventoryMock() {
  return (
    <div className="da-term">
      <div className="da-term-bar">
        <span className="da-term-title">
          INVENTORY COMMAND · {STORE_NAME.toUpperCase()} · HOT LIST
        </span>
        <div className="da-term-dots">
          <span className="da-dot da-dot-a" />
          <span className="da-dot da-dot-b" />
          <span className="da-dot" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-[var(--da-line)] px-3 py-3">
        {inventoryChips.map((chip) => (
          <span
            key={chip.label}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--da-line)] bg-[var(--da-panel-2)] px-3 py-1 text-[11.5px] text-[var(--da-muted)] [font-family:var(--da-mono)]"
          >
            <b className="da-foot-amber">{chip.value}</b>
            {chip.label}
          </span>
        ))}
      </div>

      <div className="da-term-scroll">
        <table className="da-table" style={{ minWidth: 640 }}>
          <thead>
            <tr>
              <th>Stock #</th>
              <th>Vehicle</th>
              <th className="da-r">Days</th>
              <th>Flag</th>
              <th>Owner</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {hotListUnits.map((unit) => (
              <tr key={unit.stock}>
                <td className="font-semibold">{unit.stock}</td>
                <td>{unit.vehicle}</td>
                <td className={`da-r font-semibold ${ageClass(unit.days)}`}>{unit.days}</td>
                <td>
                  {unit.willBe90 ? (
                    <span className="da-tag da-tag-red">Will be 90+ on the 1st</span>
                  ) : (
                    <span className="text-[var(--da-muted)]">—</span>
                  )}
                </td>
                <td>{unit.owner}</td>
                <td>
                  <span className={actionClass(unit.action)}>{unit.action}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
