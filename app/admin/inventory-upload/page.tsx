import { getInventoryUploadBootstrap } from "./actions";
import InventoryUploadClient from "./InventoryUploadClient";

export default async function InventoryUploadPage() {
  const { groups, stores, recent } = await getInventoryUploadBootstrap();
  return <InventoryUploadClient groups={groups} stores={stores} recent={recent} />;
}
