import { requireRole } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { ImportClient } from "./import-client";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await requireRole("admin", "operator");
  return (
    <div>
      <PageHeader
        title="Import locations"
        subtitle="Bulk-load clients and locations from a CSV file"
      />
      <ImportClient />
    </div>
  );
}
