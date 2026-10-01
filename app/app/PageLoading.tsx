const bar = "animate-pulse rounded-md bg-[var(--da-line)]";

export default function PageLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <section className="app-panel space-y-3 p-5">
        <div className={`${bar} h-2.5 w-24`} />
        <div className={`${bar} h-8 w-64 max-w-full`} />
        <div className={`${bar} h-3.5 w-80 max-w-full`} />
      </section>
      <section className="app-panel space-y-3 p-5">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className={`${bar} h-7 w-20 rounded-full`} />
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className={`${bar} h-9`} />
          ))}
        </div>
      </section>
      <section className="app-panel divide-y divide-[var(--da-line)]">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3.5">
            <div className={`${bar} h-3.5 w-14`} />
            <div className={`${bar} h-3.5 w-20`} />
            <div className={`${bar} h-3.5 flex-1`} />
            <div className={`${bar} h-3.5 w-16`} />
          </div>
        ))}
      </section>
    </div>
  );
}
