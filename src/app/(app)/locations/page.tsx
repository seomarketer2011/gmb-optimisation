import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireSession } from "@/lib/session";
import {
  Badge,
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  statusBadgeColor,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  await requireSession();
  const db = await getDb();

  const rows = await db
    .select({
      location: schema.locations,
      clientName: schema.clients.name,
    })
    .from(schema.locations)
    .innerJoin(
      schema.clients,
      eq(schema.locations.clientId, schema.clients.id),
    )
    .orderBy(asc(schema.clients.name), asc(schema.locations.name));

  return (
    <div>
      <PageHeader
        title="Properties"
        subtitle="All rank &amp; rent properties across all niches"
        actions={
          <>
            <LinkButton href="/locations/import" variant="secondary">
              Import CSV
            </LinkButton>
            <LinkButton href="/locations/new">Add property</LinkButton>
          </>
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No properties yet"
          hint="Add one manually or import a CSV of all your properties."
          action={<LinkButton href="/locations/import">Import CSV</LinkButton>}
        />
      ) : (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500 dark:border-gray-700">
                <th className="px-4 py-3 font-medium">Property</th>
                <th className="px-4 py-3 font-medium">Niche</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">City</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ location, clientName }) => (
                <tr
                  key={location.id}
                  className="border-b border-gray-100 last:border-0 dark:border-gray-800"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/locations/${location.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {location.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{clientName}</td>
                  <td className="px-4 py-3">
                    {location.primaryCategory ?? "—"}
                  </td>
                  <td className="px-4 py-3">{location.city ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge color={statusBadgeColor(location.status)}>
                      {location.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
