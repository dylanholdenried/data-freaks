export default function AwaitingApprovalPage() {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="container flex min-h-[60vh] items-center justify-center">
        <div className="max-w-md rounded-lg border border-border bg-white p-6 text-center shadow-card">
          <h1 className="text-xl font-semibold tracking-tight">Awaiting approval</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your login is active, but your dealer group has not been approved or fully configured yet.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Once a Data Freaks platform admin finishes setup, you&apos;ll receive an email and your dashboard
            will unlock automatically.
          </p>
        </div>
      </div>
    </div>
  );
}

