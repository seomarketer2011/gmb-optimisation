import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireRole } from "@/lib/session";
import { Card, Label, PageHeader, Select } from "@/components/ui";
import { LocationFields, SubmitRow } from "@/components/location-form";
import { createLocation } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewLocationPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  await requireRole("admin", "operator");
  const { clientId } = await searchParams;
  const db = await getDb();
  const clients = await db
    .select()
    .from(schema.clients)
    .orderBy(asc(schema.clients.name));

  return (
    <div>
      <PageHeader title="Add location" />
      <Card>
        <form action={createLocation}>
          <div className="mb-3 max-w-sm">
            <Label htmlFor="clientId">Client *</Label>
            <Select
              id="clientId"
              name="clientId"
              required
              defaultValue={clientId ?? ""}
            >
              <option value="" disabled>
                Select a client…
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <LocationFields />
          <SubmitRow label="Create location" />
        </form>
      </Card>
    </div>
  );
}
