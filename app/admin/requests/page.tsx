import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

async function getRequests() {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("dealer_group_requests")
    .select("id, first_name, last_name, email, dealer_group_name, number_of_stores, website, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading dealer_group_requests", error);
    return [];
  }

  return data ?? [];
}

async function updateRequestStatus(id: string, status: "active" | "rejected") {
  "use server";
  const supabase = createSupabaseServerClient();

  await supabase.from("dealer_group_requests").update({ status }).eq("id", id);
}

export default async function AdminRequestsPage() {
  const requests = await getRequests();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dealer group requests</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review inbound applications and mark them as approved or rejected. Group setup is still manual
            in V1.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-semibold">Pending and recent requests</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dealer group</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Stores</TableHead>
                <TableHead>Website</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-muted-foreground">
                    No requests yet. Applications submitted from the public site will appear here.
                  </TableCell>
                </TableRow>
              )}
              {requests.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="text-sm font-medium">{r.dealer_group_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {r.first_name} {r.last_name}
                    </div>
                    <div className="text-xs text-muted-foreground">{r.email}</div>
                  </TableCell>
                  <TableCell className="text-sm">{r.number_of_stores ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.website ?? "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        r.status === "pending"
                          ? "warning"
                          : r.status === "active"
                          ? "success"
                          : r.status === "rejected"
                          ? "destructive"
                          : "outline"
                      }
                    >
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status === "pending" && (
                      <div className="flex justify-end gap-2">
                        <form action={updateRequestStatus.bind(null, r.id, "active")}>
                          <Button size="sm" variant="outline">
                            Approve
                          </Button>
                        </form>
                        <form action={updateRequestStatus.bind(null, r.id, "rejected")}>
                          <Button size="sm" variant="ghost">
                            Reject
                          </Button>
                        </form>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

