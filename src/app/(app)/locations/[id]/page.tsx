import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireSession } from "@/lib/session";
import {
  Badge,
  Card,
  PageHeader,
  statusBadgeColor,
} from "@/components/ui";
import { LocationFields, SubmitRow } from "@/components/location-form";
import { updateLocation } from "../actions";

export const dynamic = "force-dynamic";

export default async function LocationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const db = await getDb();

  const location = await db.query.locations.findFirst({
    where: eq(schema.locations.id, id),
  });
  if (!location) notFound();

  const client = await db.query.clients.findFirst({
    where: eq(schema.clients.id, location.clientId),
  });

  const update = updateLocation.bind(null, location.id);

  return (
    <div>
      <PageHeader
        title={location.name}
        subtitle={
          client ? (
            <>
              Client:{" "}
              <Link
                href={`/clients/${client.id}`}
                className="text-blue-600 hover:underline"
              >
                {client.name}
              </Link>
            </>
          ) : undefined
        }
      />
      <div className="mb-4 flex gap-2">
        <Badge color={statusBadgeColor(location.status)}>
          {location.status}
        </Badge>
        {location.gbpUrl && (
          <a
            href={location.gbpUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            Open GBP listing ↗
          </a>
        )}
      </div>
      <Card>
        <h2 className="mb-3 font-medium">Profile details</h2>
        <form action={update}>
          <LocationFields location={location} />
          <SubmitRow label="Save changes" />
        </form>
      </Card>
      <p className="mt-4 text-sm text-gray-500">
        Tasks, prepared content, audits and the change log for this location
        will appear here as those modules land.
      </p>
    </div>
  );
}
