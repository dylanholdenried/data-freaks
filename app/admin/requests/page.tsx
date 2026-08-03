import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdminServiceClient } from "@/app/admin/admin-data";
import { rejectDealerGroupRequest } from "@/app/admin/provision-actions";
import AssignExistingAccessModal from "@/app/admin/requests/AssignExistingAccessModal";
import { revalidatePath } from "next/cache";

function resolveRequestMode(
  request_mode: string | null | undefined,
  notes: string | null | undefined
): "new" | "existing" {
  if (request_mode === "existing") return "existing";
  if (request_mode === "new") return "new";
  if (notes?.toLowerCase().startsWith("requested access to existing group:")) {
    return "existing";
  }
  return "new";
}

async function getRequests() {
  const supabase = await requireAdminServiceClient();
  const { data, error } = await supabase
    .from("dealer_group_requests")
    .select(
      "id, first_name, last_name, email, dealer_group_name, number_of_stores, website, status, created_at, dealer_group_id, notes, request_mode"
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
  const supabase = await requireAdminServiceClient();
  const [requests, { data: groups }, { data: stores }] = await Promise.all([
    getRequests(),
    supabase.from("dealer_groups").select("id, name").order("name", { ascending: true }),
    supabase
      .from("stores")
      .select("id, name, dealer_group_id")
      .order("name", { ascending: true }),
  ]);

  const groupOptions = (groups ?? []).map((g) => ({ id: g.id, name: g.name }));
  const storeOptions = (stores ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    dealer_group_id: s.dealer_group_id,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dealer group requests</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            New group requests use Start setup. Join-existing requests use Assign access to pick the
            auto group and stores.
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
                <TableHead>Type</TableHead>
                <TableHead>Stores</TableHead>
                <TableHead>Website</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-sm text-muted-foreground">
                    No requests yet. Applications submitted from the public site will appear here.
                  </TableCell>
                </TableRow>
              )}
              {requests.map((r: any) => {
                const mode = resolveRequestMode(r.request_mode, r.notes);
                const isJoinExisting = mode === "existing";
                return (
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
                    <TableCell>
                      <Badge variant="outline">
                        {isJoinExisting ? "Join existing" : "New group"}
                      </Badge>
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
                        {r.status === "pending" && isJoinExisting ? (
                          <AssignExistingAccessModal
                            request={{
                              id: r.id,
                              first_name: r.first_name,
                              last_name: r.last_name,
                              email: r.email,
                              dealer_group_name: r.dealer_group_name,
                            }}
                            groups={groupOptions}
                            stores={storeOptions}
                          />
                        ) : null}
                        {r.status === "pending" && !isJoinExisting ? (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/admin/requests/${r.id}/provision`}>Start setup</Link>
                          </Button>
                        ) : null}
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
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
