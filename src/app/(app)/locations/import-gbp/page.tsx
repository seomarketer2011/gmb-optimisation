import Link from "next/link";
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
        title="Add a property from Google"
        subtitle="Type a business name to find its live Google listing and pick it — or paste a Maps link. The profile data self-populates a new property."
      />
      <GbpImportClient niches={niches} />
      <p className="mt-6 text-sm text-gray-500">
        Adding lots at once?{" "}
        <Link
          href="/locations/import"
          className="text-blue-600 hover:underline"
        >
          Bulk-import from a CSV
        </Link>
        .
      </p>
    </div>
  );
}
