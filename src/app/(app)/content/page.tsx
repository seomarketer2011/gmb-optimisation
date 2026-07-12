import Link from "next/link";
import { desc, eq } from "drizzle-orm";
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

const FILTERS = [
  { key: "", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "ready", label: "Ready to publish" },
  { key: "published", label: "Published" },
];

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireSession();
  const { status } = await searchParams;
  const db = await getDb();

  const base = db
    .select({
      item: schema.contentItems,
      locationName: schema.locations.name,
      clientName: schema.clients.name,
    })
    .from(schema.contentItems)
    .innerJoin(
      schema.locations,
      eq(schema.contentItems.locationId, schema.locations.id),
    )
    .innerJoin(
      schema.clients,
      eq(schema.locations.clientId, schema.clients.id),
    )
    .orderBy(desc(schema.contentItems.createdAt));

  const rows = status
    ? await base.where(eq(schema.contentItems.status, status))
    : await base;

  return (
    <div>
      <PageHeader
        title="Content"
        subtitle="Prepared copy-paste content: posts, review replies, Q&A, photo briefs"
        actions={<LinkButton href="/content/new">Prepare content</LinkButton>}
      />
      <div className="mb-4 flex gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key ? `/content?status=${f.key}` : "/content"}
            className={`rounded-md px-3 py-1.5 text-sm ${
              (status ?? "") === f.key
                ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState
          title="No content here yet"
          hint="Prepare post text, review replies or Q&A for a location so the VA can copy and paste it."
          action={<LinkButton href="/content/new">Prepare content</LinkButton>}
        />
      ) : (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500 dark:border-gray-700">
                <th className="px-4 py-3 font-medium">Content</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Scheduled</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ item, locationName, clientName }) => (
                <tr
                  key={item.id}
                  className="border-b border-gray-100 last:border-0 dark:border-gray-800"
                >
                  <td className="max-w-md px-4 py-3">
                    <Link
                      href={`/content/${item.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {item.title ?? item.body.slice(0, 60) + "…"}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {item.contentType.replace("_", " ")}
                  </td>
                  <td className="px-4 py-3">
                    {locationName}
                    <span className="block text-xs text-gray-500">
                      {clientName}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge color={statusBadgeColor(item.status)}>
                      {item.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {item.scheduledFor
                      ? item.scheduledFor.toISOString().slice(0, 10)
                      : "—"}
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
