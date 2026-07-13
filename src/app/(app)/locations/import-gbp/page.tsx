import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireSession } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { GbpImportClient } from "./gbp-import-client";

export const dynamic = "force-dynamic";

export default async function ImportGbpPage() {
  await requireSession();
  const db = await getDb();
  const niches = await db
    .select({ id: schema.clients.id, name: schema.clients.name })
    .from(schema.clients)
    .orderBy(asc(schema.clients.name));

  return (
    <div>
      <PageHeader
        title="Import from GBP URL"
        subtitle="Paste any Google Maps link — share link, full Maps URL or g.page link — and the live profile data self-populates a new property"
      />
      <GbpImportClient niches={niches} />
    </div>
  );
}
