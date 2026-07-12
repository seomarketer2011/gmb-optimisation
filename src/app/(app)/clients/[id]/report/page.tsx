import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireSession } from "@/lib/session";
import { healthScore, healthColor } from "@/lib/scores";
import { Badge, Card, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

const labels = {
  calls: "Calls",
  websiteClicks: "Website clicks",
  directions: "Direction requests",
  bookings: "Bookings",
  reviewCount: "Reviews",
  rating: "Rating",
  leads: "Leads",
  qualifiedLeads: "Qualified leads",
  revenueEstimate: "Est. revenue (£)",
} as const;

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start, end };
}

function prevMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

function Delta({ now, before }: { now: number | null; before: number | null }) {
  if (now === null || before === null || before === 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  if (pct === 0) return <span className="text-gray-400"> (±0%)</span>;
  return (
    <span className={pct > 0 ? "text-green-600" : "text-red-600"}>
      {" "}
      ({pct > 0 ? "+" : ""}
      {pct}%)
    </span>
  );
}

export default async function ClientReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  const month =
    sp.month && /^\d{4}-\d{2}$/.test(sp.month)
      ? sp.month
      : new Date(Date.now() - 15 * 86400000).toISOString().slice(0, 7);
  const { start, end } = monthRange(month);
  const prev = prevMonth(month);

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

  const sections = await Promise.all(
    locations.map(async (loc) => {
      const [completedTasks, publishedContent, snapshots, latestAudit] =
        await Promise.all([
          db
            .select()
            .from(schema.tasks)
            .where(
              and(
                eq(schema.tasks.locationId, loc.id),
                gte(schema.tasks.completedAt, start),
                lte(schema.tasks.completedAt, end),
              ),
            )
            .orderBy(asc(schema.tasks.completedAt)),
          db
            .select()
            .from(schema.contentItems)
            .where(
              and(
                eq(schema.contentItems.locationId, loc.id),
                gte(schema.contentItems.publishedAt, start),
                lte(schema.contentItems.publishedAt, end),
              ),
            ),
          db
            .select()
            .from(schema.metricSnapshots)
            .where(eq(schema.metricSnapshots.locationId, loc.id)),
          db
            .select()
            .from(schema.audits)
            .where(
              and(
                eq(schema.audits.locationId, loc.id),
                eq(schema.audits.status, "completed"),
              ),
            )
            .orderBy(desc(schema.audits.completedAt))
            .limit(1),
        ]);

      const thisMonth =
        snapshots.find(
          (s) => s.periodStart.startsWith(month) && s.source === "manual",
        ) ?? snapshots.find((s) => s.periodStart.startsWith(month));
      const lastMonth =
        snapshots.find(
          (s) => s.periodStart.startsWith(prev) && s.source === "manual",
        ) ?? snapshots.find((s) => s.periodStart.startsWith(prev));

      let health: number | null = null;
      if (latestAudit[0]) {
        const auditFindings = await db
          .select()
          .from(schema.findings)
          .where(eq(schema.findings.auditId, latestAudit[0].id));
        health = healthScore(auditFindings);
      }

      return { loc, completedTasks, publishedContent, thisMonth, lastMonth, health };
    }),
  );

  return (
    <div>
      <div className="print:hidden">
        <PageHeader
          title={`Monthly report — ${client.name}`}
          subtitle={
            <>
              {month} ·{" "}
              <Link
                href={`/clients/${id}/report?month=${prev}`}
                className="text-blue-600 hover:underline"
              >
                ← previous month
              </Link>{" "}
              · Use your browser&apos;s print function to save as PDF.
            </>
          }
        />
      </div>
      <div className="hidden print:block">
        <h1 className="text-2xl font-semibold">
          {client.name} — GBP report, {month}
        </h1>
      </div>

      <div className="space-y-6">
        {sections.map(
          ({ loc, completedTasks, publishedContent, thisMonth, lastMonth, health }) => (
            <Card key={loc.id} className="break-inside-avoid">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-medium">{loc.name}</h2>
                {health !== null && (
                  <Badge color={healthColor(health)}>
                    Profile health: {health}%
                  </Badge>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Performance
                  </h3>
                  {thisMonth ? (
                    <table className="w-full text-sm">
                      <tbody>
                        {(
                          Object.keys(labels) as (keyof typeof labels)[]
                        ).map((k) => {
                          const now = thisMonth[k] as number | null;
                          const before = (lastMonth?.[k] ?? null) as
                            | number
                            | null;
                          if (now === null) return null;
                          return (
                            <tr
                              key={k}
                              className="border-b border-gray-100 last:border-0 dark:border-gray-800"
                            >
                              <td className="py-1 text-gray-500">
                                {labels[k]}
                              </td>
                              <td className="py-1 text-right font-medium">
                                {now}
                                <Delta now={now} before={before} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-sm text-gray-500">
                      No metrics recorded for {month}.
                    </p>
                  )}
                </div>

                <div>
                  <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Work completed ({completedTasks.length})
                  </h3>
                  {completedTasks.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      No tasks completed this month.
                    </p>
                  ) : (
                    <ul className="list-inside list-disc text-sm text-gray-700 dark:text-gray-300">
                      {completedTasks.map((t) => (
                        <li key={t.id}>{t.title}</li>
                      ))}
                    </ul>
                  )}
                  {publishedContent.length > 0 && (
                    <>
                      <h3 className="mb-1 mt-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
                        Content published ({publishedContent.length})
                      </h3>
                      <ul className="list-inside list-disc text-sm text-gray-700 dark:text-gray-300">
                        {publishedContent.map((c) => (
                          <li key={c.id}>
                            {c.title ?? c.contentType.replace("_", " ")}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ),
        )}
      </div>
    </div>
  );
}
