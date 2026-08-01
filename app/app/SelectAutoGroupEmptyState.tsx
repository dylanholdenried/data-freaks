export default function SelectAutoGroupEmptyState() {
  return (
    <div className="app-panel mx-auto max-w-lg p-8 text-center">
      <p className="app-kicker">Store Analytics</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
        Select an auto group
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Choose which auto group to view from the sidebar dropdown. You can only view one group at a
        time.
      </p>
    </div>
  );
}
