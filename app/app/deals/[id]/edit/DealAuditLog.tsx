import {
  formatDealEventAction,
  formatDealEventActor,
  formatDealEventWhen,
  type DealEventRow,
} from "@/lib/deals/deal-events";

type Props = {
  events: DealEventRow[];
};

export default function DealAuditLog({ events }: Props) {
  return (
    <section className="app-panel p-5">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">
        Activity
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Who created this deal and changed its status.
      </p>

      {events.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No activity recorded yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex flex-col gap-0.5 border-l-2 border-border pl-3 text-sm sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
            >
              <p className="text-foreground">
                <span className="font-medium">{formatDealEventActor(event)}</span>{" "}
                {formatDealEventAction(event)}
              </p>
              <time
                dateTime={event.created_at}
                className="shrink-0 text-xs text-muted-foreground"
              >
                {formatDealEventWhen(event.created_at)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
