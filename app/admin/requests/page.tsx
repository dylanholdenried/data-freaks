import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdminServiceClient } from "@/app/admin/admin-data";
import { rejectDealerGroupRequest } from "@/app/admin/provision-actions";
import { revalidatePath } from "next/cache";

async function getRequests() {
  const supabase = await requireAdminServiceClient();
  const { data, error } = await supabase
    .from("dealer_group_requests")
    .select(
      "id, first_name, last_name, email, dealer_group_name, number_of_stores, website, status, created_at, dealer_group_id"
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading dealer_group_requests", error);
    return [];
  }

  return data ?? [];
}

async function rejectRequest(id: string) {
  "use server";
  await rejectDealerGroupRequest(id);
  revalidatePath("/admin/requests");
}

export default async function AdminRequestsPage() {
  const requests = await getRequests();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dealer group requests</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Start setup to provision the auto group, then activate to email the group admin.
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
                    <div className="flex justify-end gap-2">
                      {(r.status === "pending" || (r.status === "pending" && r.dealer_group_id)) && (
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/admin/requests/${r.id}/provision`}>Start setup</Link>
                        </Button>
                      )}
                      {r.status === "pending" && (
                        <form action={rejectRequest.bind(null, r.id)}>
                          <Button size="sm" variant="ghost">
                            Reject
                          </Button>
                        </form>
                      )}
                      {r.status === "active" && r.dealer_group_id ? (
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/admin/groups/${r.dealer_group_id}`}>View group</Link>
                        </Button>
                      ) : null}
                    </div>
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
