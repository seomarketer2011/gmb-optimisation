import Link from "next/link";
import { asc, count, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireSession } from "@/lib/session";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Textarea,
  statusBadgeColor,
} from "@/components/ui";
import { createClient } from "./actions";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  await requireSession();
  const db = await getDb();

  const rows = await db
    .select({
      client: schema.clients,
      locationCount: count(schema.locations.id),
    })
    .from(schema.clients)
    .leftJoin(
      schema.locations,
      eq(schema.locations.clientId, schema.clients.id),
    )
    .groupBy(schema.clients.id)
    .orderBy(asc(schema.clients.name));

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle="Each client owns one or more GBP locations"
      />
      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          {rows.length === 0 ? (
            <EmptyState
              title="No clients yet"
              hint="Add your first client using the form."
            />
          ) : (
            <Card className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500 dark:border-gray-700">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Locations</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ client, locationCount }) => (
                    <tr
                      key={client.id}
                      className="border-b border-gray-100 last:border-0 dark:border-gray-800"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/clients/${client.id}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {client.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Badge color={statusBadgeColor(client.status)}>
                          {client.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">{locationCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
        <Card>
          <h2 className="mb-3 font-medium">Add client</h2>
          <form action={createClient} className="space-y-3">
            <div>
              <Label htmlFor="name">Client name</Label>
              <Input id="name" name="name" required />
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" rows={3} />
            </div>
            <Button type="submit">Add client</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
