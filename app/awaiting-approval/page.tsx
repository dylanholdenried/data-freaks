import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default async function AwaitingApprovalPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50">
      <div className="container flex min-h-[60vh] items-center justify-center py-10">
        <Card className="w-full max-w-lg">
          <CardContent className="space-y-6 pt-8 text-center">
            <p className="text-base leading-relaxed text-foreground">
              We are currently processing your request, and working as quickly as possible to activate
              your account!
            </p>
            <form action="/api/auth/signout" method="post">
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
