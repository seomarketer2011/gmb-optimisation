import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireSession } from "@/lib/session";
import {
  Button,
  Card,
  Input,
  Label,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";
import { addMetricSnapshot } from "./actions";

export const dynamic = "force-dynamic";

const METRIC_COLUMNS = [
  ["calls", "Calls"],
  ["websiteClicks", "Clicks"],
  ["directions", "Directions"],
  ["bookings", "Bookings"],
  ["reviewCount", "Reviews"],
  ["rating", "Rating"],
  ["leads", "Leads"],
  ["qualifiedLeads", "Qualified"],
  ["revenueEstimate", "Est. revenue"],
] as const;

export default async function MetricsPage({
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

  const snapshots = await db
    .select()
    .from(schema.metricSnapshots)
    .where(eq(schema.metricSnapshots.locationId, id))
    .orderBy(desc(schema.metricSnapshots.periodStart));

  const add = addMetricSnapshot.bind(null, id);
  // Server component rendered per request (force-dynamic), so reading the
  // clock here is per-request, not per-render-cycle
  // eslint-disable-next-line react-hooks/purity
  const defaultMonth = new Date(Date.now() - 15 * 86400000)
    .toISOString()
    .slice(0, 7);

  return (
    <div>
      <PageHeader
        title={`Metrics — ${location.name}`}
        subtitle={
          <>
            Monthly performance snapshots.{" "}
            <Link
              href={`/locations/${id}`}
              className="text-blue-600 hover:underline"
            >
              Back to location
            </Link>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {snapshots.length === 0 ? (
            <Card>
              <p className="text-sm text-gray-500">
                No snapshots yet. Enter last month&apos;s numbers from GBP &gt;
                Performance using the form.
              </p>
            </Card>
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500 dark:border-gray-700">
                    <th className="px-3 py-2 font-medium">Period</th>
                    <th className="px-3 py-2 font-medium">Source</th>
                    {METRIC_COLUMNS.map(([k, label]) => (
                      <th key={k} className="px-3 py-2 font-medium">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {snapshots.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-gray-100 last:border-0 dark:border-gray-800"
                    >
                      <td className="px-3 py-2 whitespace-nowrap">
                        {s.periodStart.slice(0, 7)}
                      </td>
                      <td className="px-3 py-2">{s.source}</td>
                      {METRIC_COLUMNS.map(([k]) => (
                        <td key={k} className="px-3 py-2">
                          {s[k] ?? "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        <Card className="h-fit">
          <h2 className="mb-3 font-medium">Add / update snapshot</h2>
          <form action={add} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="month">Month</Label>
                <Input
                  id="month"
                  name="month"
                  type="month"
                  required
                  defaultValue={defaultMonth}
                />
              </div>
              <div>
                <Label htmlFor="source">Source</Label>
                <Select id="source" name="source" defaultValue="manual">
                  <option value="manual">Manual</option>
                  <option value="gbp_export">GBP export</option>
                  <option value="call_tracker">Call tracker</option>
                  <option value="crm">CRM</option>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="calls">Calls</Label>
                <Input id="calls" name="calls" type="number" min="0" />
              </div>
              <div>
                <Label htmlFor="websiteClicks">Website clicks</Label>
                <Input id="websiteClicks" name="websiteClicks" type="number" min="0" />
              </div>
              <div>
                <Label htmlFor="directions">Directions</Label>
                <Input id="directions" name="directions" type="number" min="0" />
              </div>
              <div>
                <Label htmlFor="bookings">Bookings</Label>
                <Input id="bookings" name="bookings" type="number" min="0" />
              </div>
              <div>
                <Label htmlFor="reviewCount">Review count</Label>
                <Input id="reviewCount" name="reviewCount" type="number" min="0" />
              </div>
              <div>
                <Label htmlFor="rating">Rating</Label>
                <Input id="rating" name="rating" type="number" step="0.1" min="1" max="5" />
              </div>
              <div>
                <Label htmlFor="leads">Leads</Label>
                <Input id="leads" name="leads" type="number" min="0" />
              </div>
              <div>
                <Label htmlFor="qualifiedLeads">Qualified leads</Label>
                <Input id="qualifiedLeads" name="qualifiedLeads" type="number" min="0" />
              </div>
            </div>
            <div>
              <Label htmlFor="revenueEstimate">Estimated revenue (£)</Label>
              <Input id="revenueEstimate" name="revenueEstimate" type="number" min="0" step="0.01" />
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" name="notes" rows={2} />
            </div>
            <Button type="submit">Save snapshot</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
