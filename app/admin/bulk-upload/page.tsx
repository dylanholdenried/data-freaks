import { getBulkUploadBootstrap } from "./actions";
import BulkUploadClient from "./BulkUploadClient";

export default async function BulkUploadPage() {
  const { groups, stores, history } = await getBulkUploadBootstrap();

  return <BulkUploadClient groups={groups} stores={stores} history={history} />;
}
