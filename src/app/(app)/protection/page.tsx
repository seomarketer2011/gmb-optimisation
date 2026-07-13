import Link from "next/link";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireSession } from "@/lib/session";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { runAllIntegrityChecks } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProtectionOverviewPage() {
  await requireSession();
  const db = await getDb();

  const locations = await db
    .select({
      location: schema.locations,
      nicheName: schema.clients.name,
    })
    .from(schema.locations)
    .innerJoin(schema.clients, eq(schema.locations.clientId, schema.clients.id))
    .where(inArray(schema.locations.status, ["active", "onboarding"]))
    .orderBy(asc(schema.clients.name), asc(schema.locations.name));

  const [baselines, checks, openAlerts] = await Promise.all([
    db.select().from(schema.gbpBaselines),
    db
      .select()
      .from(schema.integrityChecks)
      .orderBy(desc(schema.integrityChecks.runAt)),
    db
      .select()
      .from(schema.integrityAlerts)
      .where(eq(schema.integrityAlerts.status, "open")),
  ]);

  const baselineByLocation = new Map(baselines.map((b) => [b.locationId, b]));
  const latestCheck = new Map<string, (typeof checks)[number]>();
  for (const c of checks) {
    if (!latestCheck.has(c.locationId)) latestCheck.set(c.locationId, c);
  }
  const alertCount = new Map<string, number>();
  for (const a of openAlerts) {
    alertCount.set(a.locationId, (alertCount.get(a.locationId) ?? 0) + 1);
  }

  const protectedCount = locations.filter(({ location }) =>
    baselineByLocation.has(location.id),
  ).length;

  return (
    <div>
      <PageHeader
        title="Data protection"
        subtitle="Catches Google suggested edits changing listing data: confirm each property's correct data once, then re-check the live listings against it"
        actions={
          protectedCount > 0 ? (
            <form action={runAllIntegrityChecks}>
              <Button type="submit">Run all checks</Button>
            </form>
          ) : undefined
        }
      />

      {locations.length === 0 ? (
        <EmptyState
          title="No properties yet"
          hint="Add or import a property first, then protect its data here."
        />
      ) : (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500 dark:border-gray-700">
                <th className="px-4 py-3 font-medium">Property</th>
                <th className="px-4 py-3 font-medium">Niche</th>
                <th className="px-4 py-3 font-medium">Baseline</th>
                <th className="px-4 py-3 font-medium">Last check</th>
                <th className="px-4 py-3 font-medium">Alerts</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {locations.map(({ location, nicheName }) => {
                const baseline = baselineByLocation.get(location.id);
                const check = latestCheck.get(location.id);
                const alerts = alertCount.get(location.id) ?? 0;
                return (
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
                    <td className="px-4 py-3">{nicheName}</td>
                    <td className="px-4 py-3">
                      {baseline ? (
                        <Badge color="green">confirmed</Badge>
                      ) : (
                        <Badge color="yellow">not confirmed</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {check ? (
                        <span className="flex items-center gap-2">
                          <Badge
                            color={
                              check.status === "ok"
                                ? "green"
                                : check.status === "drift"
                                  ? "red"
                                  : "yellow"
                            }
                          >
                            {check.status === "ok"
                              ? "all correct"
                              : check.status === "drift"
                                ? "data changed"
                                : "error"}
                          </Badge>
                          <span className="text-xs text-gray-500">
                            {check.runAt.toISOString().slice(0, 10)}
                          </span>
                        </span>
                      ) : (
                        <span className="text-gray-400">never</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {alerts > 0 ? (
                        <Badge color="red">{alerts} open</Badge>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/locations/${location.id}/protection`}
                        className="text-sm font-medium text-blue-600 hover:underline"
                      >
                        {baseline ? "Open" : "Protect"} →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      <p className="mt-4 text-xs text-gray-500">
        Checks use the Places API and compare business name, address, phone,
        primary category and opening hours. A detected change opens an alert
        and creates an urgent restore task in the VA queue. Run &ldquo;all
        checks&rdquo; as part of the weekly profile sweep.
      </p>
    </div>
  );
}
