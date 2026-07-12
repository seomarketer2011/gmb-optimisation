import Link from "next/link";
import { notFound } from "next/navigation";
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

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const db = await getDb();

  const client = await db.query.clients.findFirst({
    where: eq(schema.clients.id, id),
  });
  if (!client) notFound();

  const locations = await db
    .select()
    .from(schema.locations)
    .where(eq(schema.locations.clientId, id))
    .orderBy(asc(schema.locations.name));

  return (
    <div>
      <PageHeader
        title={client.name}
        subtitle={client.notes ?? undefined}
        actions={
          <LinkButton href={`/locations/new?clientId=${client.id}`}>
            Add location
          </LinkButton>
        }
      />
      <div className="mb-4">
        <Badge color={statusBadgeColor(client.status)}>{client.status}</Badge>
      </div>
      {locations.length === 0 ? (
        <EmptyState
          title="No locations yet"
          hint="Add a location manually or use the CSV import."
          action={
            <LinkButton href="/locations/import" variant="secondary">
              Import CSV
            </LinkButton>
          }
        />
      ) : (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500 dark:border-gray-700">
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Phone</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {locations.map((loc) => (
                <tr
                  key={loc.id}
                  className="border-b border-gray-100 last:border-0 dark:border-gray-800"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/locations/${loc.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {loc.name}
                    </Link>
                    {loc.city && (
                      <span className="ml-2 text-gray-500">{loc.city}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{loc.primaryCategory ?? "—"}</td>
                  <td className="px-4 py-3">{loc.phone ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge color={statusBadgeColor(loc.status)}>
                      {loc.status}
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
