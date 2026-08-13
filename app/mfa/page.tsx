import { requireOwnerAdminMfaPage } from "@/lib/mfa";
import MfaClient from "./MfaClient";

export default async function MfaPage() {
  await requireOwnerAdminMfaPage();
  return <MfaClient />;
}
