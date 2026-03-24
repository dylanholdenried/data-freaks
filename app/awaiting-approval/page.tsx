import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { profileMatchAuthUserId } from "@/lib/supabase/profile-match";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AwaitingApprovalPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id,email,status,role,dealer_group_id,user_id")
    .or(profileMatchAuthUserId(session.user.id))
    .maybeSingle();

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="container flex min-h-[60vh] items-center justify-center py-10">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="text-xl font-semibold tracking-tight">Awaiting approval</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              Your login is active, but the app still needs an <span className="font-medium text-foreground">active</span>{" "}
              profile before you can use <span className="font-medium text-foreground">/app</span>.
            </p>

            <div className="rounded-md border border-border bg-white p-3 text-left font-mono text-xs text-foreground">
              <div className="mb-2 text-[11px] font-sans font-medium uppercase tracking-wide text-muted-foreground">
                What the app sees (debug)
              </div>
              <div>auth user id: {session.user.id}</div>
              {error && (
                <div className="mt-2 text-destructive">
                  profiles query error: {error.message} ({error.code})
                </div>
              )}
              {!error && !profile && (
                <div className="mt-2 text-amber-700">
                  No <code className="rounded bg-slate-100 px-1">profiles</code> row where{" "}
                  <code className="rounded bg-slate-100 px-1">user_id</code> matches this auth user (or RLS is hiding
                  it).
                </div>
              )}
              {!error && profile && (
                <div className="mt-2 space-y-1">
                  <div>
                    profile status: <span className="font-semibold">{String(profile.status)}</span>
                  </div>
                  <div>
                    profile role: <span className="font-semibold">{String(profile.role)}</span>
                  </div>
                  <div>dealer_group_id: {profile.dealer_group_id ?? "null"}</div>
                </div>
              )}
            </div>

            <div className="rounded-md border border-dashed border-border bg-slate-50 p-3 text-xs">
              <p className="font-medium text-foreground">To unlock /app</p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>
                  In Supabase → <strong>Table Editor → profiles</strong>, ensure a row exists with{" "}
                  <code className="rounded bg-white px-1">user_id</code> = your Auth user UUID (shown above).
                </li>
                <li>
                  Set <code className="rounded bg-white px-1">status</code> to <strong>active</strong> (exact enum
                  value).
                </li>
                <li>
                  Set <code className="rounded bg-white px-1">dealer_group_id</code> to a real dealer group id (create
                  one in <code className="rounded bg-white px-1">dealer_groups</code> if needed).
                </li>
                <li>
                  Then use <strong>Sign out</strong> below and sign in again (forces a fresh server read).
                </li>
              </ul>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button asChild variant="outline" size="sm">
                <Link href="/login">Back to login</Link>
              </Button>
              <form action="/api/auth/signout" method="post">
                <Button type="submit" variant="secondary" size="sm">
                  Sign out
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
