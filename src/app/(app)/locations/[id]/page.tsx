import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireSession } from "@/lib/session";
import {
  Badge,
  Button,
  Card,
  LinkButton,
  PageHeader,
  statusBadgeColor,
} from "@/components/ui";
import { LocationFields, SubmitRow } from "@/components/location-form";
import { updateLocation } from "../actions";
import { setupStandardOpsPlan } from "../../tasks/actions";

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

  const [client, openTasks, content] = await Promise.all([
    db.query.clients.findFirst({
      where: eq(schema.clients.id, location.clientId),
    }),
    db
      .select()
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.locationId, id),
          inArray(schema.tasks.status, [
            "backlog",
            "todo",
            "in_progress",
            "waiting",
            "blocked",
          ]),
        ),
      )
      .orderBy(asc(schema.tasks.dueDate)),
    db
      .select()
      .from(schema.contentItems)
      .where(
        and(
          eq(schema.contentItems.locationId, id),
          inArray(schema.contentItems.status, ["draft", "ready"]),
        ),
      )
      .orderBy(desc(schema.contentItems.createdAt)),
  ]);

  const open = openTasks;
  const locationContent = content;

  const update = updateLocation.bind(null, location.id);
  const setupPlan = setupStandardOpsPlan.bind(null, location.id);

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
        actions={
          <>
            <LinkButton
              href={`/tasks/new?locationId=${location.id}`}
              variant="secondary"
            >
              New task
            </LinkButton>
            <LinkButton
              href={`/content/new?locationId=${location.id}`}
              variant="secondary"
            >
              Prepare content
            </LinkButton>
          </>
        }
      />
      <div className="mb-4 flex items-center gap-2">
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

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">Open tasks ({open.length})</h2>
            {open.length === 0 && (
              <form action={setupPlan}>
                <Button type="submit" variant="secondary">
                  Set up standard ops plan
                </Button>
              </form>
            )}
          </div>
          {open.length === 0 ? (
            <p className="text-sm text-gray-500">
              No open tasks. &ldquo;Set up standard ops plan&rdquo; creates the
              recurring VA work cycle: weekly post, review sweep, monthly
              photos, Q&A, profile checks and monthly metrics.
            </p>
          ) : (
            <ul className="space-y-2">
              {open.slice(0, 8).map((t) => (
                <li key={t.id} className="flex items-center justify-between text-sm">
                  <Link
                    href={`/tasks/${t.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {t.title}
                  </Link>
                  <span className="flex items-center gap-2">
                    <Badge color={statusBadgeColor(t.status)}>
                      {t.status.replace("_", " ")}
                    </Badge>
                    <span className="text-xs text-gray-500">
                      {t.dueDate ? t.dueDate.toISOString().slice(0, 10) : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 font-medium">
            Content in progress ({locationContent.length})
          </h2>
          {locationContent.length === 0 ? (
            <p className="text-sm text-gray-500">
              No draft or ready content for this location.
            </p>
          ) : (
            <ul className="space-y-2">
              {locationContent.slice(0, 8).map((c) => (
                <li key={c.id} className="flex items-center justify-between text-sm">
                  <Link
                    href={`/content/${c.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {c.title ?? c.contentType.replace("_", " ")}
                  </Link>
                  <Badge color={statusBadgeColor(c.status)}>{c.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="mb-3 font-medium">Profile details</h2>
        <form action={update}>
          <LocationFields location={location} />
          <SubmitRow label="Save changes" />
        </form>
      </Card>
    </div>
  );
}
