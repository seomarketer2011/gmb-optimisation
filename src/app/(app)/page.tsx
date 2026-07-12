import Link from "next/link";
import { count, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireSession } from "@/lib/session";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  await requireSession();
  const db = await getDb();

  const [clientCount] = await db
    .select({ value: count() })
    .from(schema.clients)
    .where(eq(schema.clients.status, "active"));
  const [locationCount] = await db
    .select({ value: count() })
    .from(schema.locations)
    .where(eq(schema.locations.status, "active"));
  const [openTasks] = await db
    .select({ value: count() })
    .from(schema.tasks)
    .where(
      inArray(schema.tasks.status, ["todo", "in_progress", "waiting"]),
    );
  const [readyContent] = await db
    .select({ value: count() })
    .from(schema.contentItems)
    .where(eq(schema.contentItems.status, "ready"));

  const stats = [
    { label: "Active clients", value: clientCount.value, href: "/clients" },
    {
      label: "Active locations",
      value: locationCount.value,
      href: "/locations",
    },
    { label: "Open tasks", value: openTasks.value, href: "/tasks" },
    {
      label: "Content ready to publish",
      value: readyContent.value,
      href: "/content?status=ready",
    },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="What should the team work on today?"
      />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="transition-shadow hover:shadow-md">
              <p className="text-sm text-gray-500">{s.label}</p>
              <p className="mt-1 text-3xl font-semibold">{s.value}</p>
            </Card>
          </Link>
        ))}
      </div>
      {clientCount.value === 0 && (
        <div className="mt-8">
          <EmptyState
            title="No clients yet"
            hint="Add your first client, then add or import their locations."
            action={<LinkButton href="/clients">Add a client</LinkButton>}
          />
        </div>
      )}
    </div>
  );
}
