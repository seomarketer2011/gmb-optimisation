import Link from "next/link";
import { asc, eq, inArray, max, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireSession } from "@/lib/session";
import { getGoogleMapsKey } from "@/lib/google-key";
import { checkStatusDisplay } from "@/lib/integrity";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { runAllIntegrityChecks } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProtectionOverviewPage() {
  await requireSession();
  const db = await getDb();

  const [locations, baselines, latestChecks, openAlerts, apiKey] =
    await Promise.all([
      db
        .select({
          location: schema.locations,
          nicheName: schema.clients.name,
        })
        .from(schema.locations)
        .innerJoin(
          schema.clients,
          eq(schema.locations.clientId, schema.clients.id),
        )
        .where(inArray(schema.locations.status, ["active", "onboarding"]))
        .orderBy(asc(schema.clients.name), asc(schema.locations.name)),
      db
        .select({ locationId: schema.gbpBaselines.locationId })
        .from(schema.gbpBaselines),
      // Latest check per location in SQL — SQLite returns the max-row's
      // values for bare columns alongside MAX(), so this is one indexed
      // aggregate instead of loading the whole ever-growing history
      db
        .select({
          locationId: schema.integrityChecks.locationId,
          status: schema.integrityChecks.status,
          runAt: max(schema.integrityChecks.runAt),
        })
        .from(schema.integrityChecks)
        .groupBy(schema.integrityChecks.locationId),
      db
        .select({
          locationId: schema.integrityAlerts.locationId,
          count: sql<number>`count(*)`,
        })
        .from(schema.integrityAlerts)
        .where(eq(schema.integrityAlerts.status, "open"))
        .groupBy(schema.integrityAlerts.locationId),
      getGoogleMapsKey(),
    ]);

  const hasBaseline = new Set(baselines.map((b) => b.locationId));
  const latestCheck = new Map(latestChecks.map((c) => [c.locationId, c]));
  const alertCount = new Map(openAlerts.map((a) => [a.locationId, a.count]));
  const protectedCount = locations.filter(({ location }) =>
    hasBaseline.has(location.id),
  ).length;

  return (
    <div>
      <PageHeader
        title="Data protection"
        subtitle="Catches Google suggested edits changing listing data: confirm each property's correct data once, then re-check the live listings against it"
        actions={
          protectedCount > 0 && apiKey ? (
            <form action={runAllIntegrityChecks}>
              <Button type="submit">Run all checks</Button>
            </form>
          ) : undefined
        }
      />

      {!apiKey && (
        <Card className="mb-6 border-red-300 dark:border-red-800">
          <p className="text-sm text-red-700 dark:text-red-400">
            ⚠ Checks cannot run — the <code>GOOGLE_MAPS_API_KEY</code> secret
            is not configured. Nothing is being monitored until it is added
            (see README).
          </p>
        </Card>
      )}

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
                const check = latestCheck.get(location.id);
                const alerts = alertCount.get(location.id) ?? 0;
                const display = check ? checkStatusDisplay(check.status) : null;
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
                      {hasBaseline.has(location.id) ? (
                        <Badge color="green">confirmed</Badge>
                      ) : (
                        <Badge color="yellow">not confirmed</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {check && display ? (
                        <span className="flex items-center gap-2">
                          <Badge color={display.color}>{display.label}</Badge>
                          <span className="text-xs text-gray-500">
                            {check.runAt?.toISOString().slice(0, 10)}
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
                        {hasBaseline.has(location.id) ? "Open" : "Protect"} →
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
        primary category, opening hours, open/closed status and the map-pin
        location. A detected change opens an alert and creates an urgent
        restore task in the VA queue. Run &ldquo;all checks&rdquo; as part of
        the weekly profile sweep.
      </p>
    </div>
  );
}
