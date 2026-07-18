import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireSession } from "@/lib/session";
import { getGoogleMapsKey } from "@/lib/google-key";
import { fetchLiveListing, type GbpLookupResult } from "@/lib/places";
import {
  businessStatusLabel,
  checkStatusDisplay,
  fieldLabel,
  formatPin,
  hoursToText,
  parseBaselineHours,
} from "@/lib/integrity";
import {
  Badge,
  Button,
  Card,
  Input,
  Label,
  PageHeader,
  Textarea,
} from "@/components/ui";
import {
  confirmBaseline,
  runIntegrityCheck,
  setAlertStatus,
} from "../../../protection/actions";

export const dynamic = "force-dynamic";

export default async function ProtectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const role = (session.user as { role?: string }).role ?? "va";
  const canEdit = role === "admin" || role === "operator";
  const { id } = await params;
  const db = await getDb();

  const location = await db.query.locations.findFirst({
    where: eq(schema.locations.id, id),
  });
  if (!location) notFound();

  const [baseline, checks, alerts] = await Promise.all([
    db.query.gbpBaselines.findFirst({
      where: eq(schema.gbpBaselines.locationId, id),
    }),
    db
      .select()
      .from(schema.integrityChecks)
      .where(eq(schema.integrityChecks.locationId, id))
      .orderBy(desc(schema.integrityChecks.runAt))
      .limit(10),
    db
      .select()
      .from(schema.integrityAlerts)
      .where(
        and(
          eq(schema.integrityAlerts.locationId, id),
          eq(schema.integrityAlerts.status, "open"),
        ),
      )
      .orderBy(desc(schema.integrityAlerts.createdAt)),
  ]);

  const confirmedByUser = baseline?.confirmedBy
    ? await db.query.user.findFirst({
        where: eq(schema.user.id, baseline.confirmedBy),
      })
    : null;

  // Live fetch only when the operator can act on it: first confirm (prefill
  // + snapshot), or an existing baseline that still lacks its status/pin
  // snapshot (pre-snapshot confirms, or Google was unreachable last time)
  const snapshotMissing =
    !!baseline && baseline.businessStatus == null && baseline.latitude == null;
  let live: GbpLookupResult | null = null;
  if (canEdit && (!baseline || snapshotMissing)) {
    const apiKey = await getGoogleMapsKey();
    if (apiKey && (location.placeId || location.gbpUrl)) {
      const result = await fetchLiveListing(location, apiKey);
      if (result.ok) live = result.data;
    }
  }

  // One construction, clearest source first: live listing → baseline → record
  const prefill = {
    businessName: baseline?.businessName ?? live?.name ?? location.name,
    address: baseline?.address ?? live?.address ?? location.address ?? "",
    phone: baseline?.phone ?? live?.phone ?? location.phone ?? "",
    primaryCategory:
      baseline?.primaryCategory ??
      live?.primaryCategory ??
      location.primaryCategory ??
      "",
    hours: baseline
      ? hoursToText(parseBaselineHours(baseline.hours))
      : hoursToText(live?.hours ?? []),
  };
  const monitored = {
    status: businessStatusLabel(
      baseline?.businessStatus ?? live?.businessStatus ?? null,
    ),
    pin: formatPin(
      baseline?.latitude ?? live?.latitude ?? null,
      baseline?.longitude ?? live?.longitude ?? null,
    ),
  };

  const confirm = confirmBaseline.bind(null, location.id);
  const runCheck = runIntegrityCheck.bind(null, location.id);

  return (
    <div>
      <PageHeader
        title="Data protection"
        subtitle={
          <>
            <Link
              href={`/locations/${location.id}`}
              className="text-blue-600 hover:underline"
            >
              {location.name}
            </Link>{" "}
            — confirm the correct listing data, then re-check it against
            Google to catch suggested edits changing it
          </>
        }
        actions={
          baseline ? (
            <form action={runCheck}>
              <Button type="submit">Run check now</Button>
            </form>
          ) : undefined
        }
      />

      {baseline && snapshotMissing && (
        <Card className="mb-6 border-yellow-300 dark:border-yellow-800">
          <p className="text-sm text-yellow-800 dark:text-yellow-300">
            ⚠ Open/closed status and the map pin are <strong>not being
            monitored yet</strong> for this property — Google couldn&rsquo;t be
            reached when the baseline was confirmed.
            {canEdit
              ? live
                ? " The live values are shown below — click Update baseline to start monitoring them."
                : " Google is still unreachable (check the API key), so they can't be captured right now."
              : " Ask an operator to update the baseline."}
          </p>
        </Card>
      )}

      {alerts.length > 0 && (
        <Card className="mb-6 border-red-300 dark:border-red-800">
          <h2 className="mb-3 font-medium text-red-700 dark:text-red-400">
            ⚠ Open alerts ({alerts.length}) — Google shows different data
          </h2>
          <div className="space-y-4">
            {alerts.map((a) => (
              <div
                key={a.id}
                className="rounded-md border border-gray-200 p-3 dark:border-gray-700"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{fieldLabel(a.field)}</span>
                  <span className="text-xs text-gray-500">
                    detected {a.createdAt.toISOString().slice(0, 10)}
                  </span>
                </div>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase text-gray-500">
                      Correct (baseline)
                    </p>
                    <p className="whitespace-pre-line">{a.expectedValue}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase text-red-600">
                      Google shows
                    </p>
                    <p className="whitespace-pre-line">{a.liveValue}</p>
                  </div>
                </div>
                {a.notes && (
                  <p className="mt-2 whitespace-pre-line text-xs text-gray-500">
                    {a.notes}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {a.taskId && (
                    <Link
                      href={`/tasks/${a.taskId}`}
                      className="text-sm font-medium text-blue-600 hover:underline"
                    >
                      Restore task →
                    </Link>
                  )}
                  <form action={setAlertStatus.bind(null, a.id, "resolved")}>
                    <Button type="submit" variant="secondary">
                      Mark resolved
                    </Button>
                  </form>
                  {canEdit && (
                    <form action={setAlertStatus.bind(null, a.id, "dismissed")}>
                      <Button type="submit" variant="secondary">
                        Accept new value
                      </Button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Mark resolved once Google shows the correct value again (this also
            completes the restore task). Accept new value (operators) adopts
            what Google shows into the baseline and cancels the restore task.
          </p>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-1 font-medium">
            {baseline ? "Confirmed baseline" : "Confirm the correct data"}
          </h2>
          <p className="mb-4 text-sm text-gray-500">
            {baseline ? (
              <>
                Confirmed {baseline.confirmedAt.toISOString().slice(0, 10)}
                {confirmedByUser ? ` by ${confirmedByUser.name}` : ""}. Every
                check compares Google&rsquo;s live listing against these
                values.
              </>
            ) : live ? (
              "Pre-filled from the live Google listing. Check every field against reality — this becomes the source of truth."
            ) : (
              "Pre-filled from the property record. Check every field against reality — this becomes the source of truth."
            )}
          </p>
          {canEdit ? (
            <form action={confirm} className="space-y-3">
              {/* Snapshot of the live values the operator is looking at —
                  captured once at first confirm, never silently re-fetched */}
              {live?.businessStatus && (
                <input
                  type="hidden"
                  name="liveBusinessStatus"
                  value={live.businessStatus}
                />
              )}
              {live?.latitude != null && live?.longitude != null && (
                <>
                  <input
                    type="hidden"
                    name="liveLatitude"
                    value={String(live.latitude)}
                  />
                  <input
                    type="hidden"
                    name="liveLongitude"
                    value={String(live.longitude)}
                  />
                </>
              )}
              <div>
                <Label htmlFor="businessName">Business name *</Label>
                <Input
                  id="businessName"
                  name="businessName"
                  defaultValue={prefill.businessName}
                  required
                />
              </div>
              <div>
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  name="address"
                  defaultValue={prefill.address}
                />
              </div>
              <div>
                <Label htmlFor="phone">Telephone number</Label>
                <Input id="phone" name="phone" defaultValue={prefill.phone} />
              </div>
              <div>
                <Label htmlFor="primaryCategory">Primary category</Label>
                <Input
                  id="primaryCategory"
                  name="primaryCategory"
                  defaultValue={prefill.primaryCategory}
                />
              </div>
              <div>
                <Label htmlFor="hours">Opening hours (one day per line)</Label>
                <Textarea
                  id="hours"
                  name="hours"
                  rows={7}
                  defaultValue={prefill.hours}
                  placeholder={"Monday: 9:00 AM – 5:00 PM\nTuesday: 9:00 AM – 5:00 PM\n…"}
                />
              </div>
              <div className="rounded-md bg-gray-50 p-3 text-sm dark:bg-gray-800/50">
                <p className="mb-1 text-xs font-medium uppercase text-gray-500">
                  Also monitored (captured automatically)
                </p>
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  <span>
                    Open/closed status:{" "}
                    <span className="font-medium">{monitored.status}</span>
                  </span>
                  <span>
                    Map pin:{" "}
                    <span className="font-medium">{monitored.pin}</span>
                  </span>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Fields left blank are not protected. Open/closed status and
                the map pin are captured from the live listing shown above
                when you confirm; accepting a later change goes through its
                alert, never silently.
              </p>
              <Button type="submit">
                {baseline ? "Update baseline" : "Confirm baseline"}
              </Button>
            </form>
          ) : (
            <div className="space-y-2 text-sm">
              {[
                ["Business name", prefill.businessName],
                ["Address", prefill.address || "—"],
                ["Telephone number", prefill.phone || "—"],
                ["Primary category", prefill.primaryCategory || "—"],
                ["Opening hours", prefill.hours || "—"],
                ["Open/closed status", monitored.status],
                ["Map pin", monitored.pin],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-xs font-medium uppercase text-gray-500">
                    {label}
                  </p>
                  <p className="whitespace-pre-line">{value}</p>
                </div>
              ))}
              <p className="pt-2 text-xs text-gray-500">
                Only operators and admins can change the confirmed baseline.
              </p>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 font-medium">Check history</h2>
          {checks.length === 0 ? (
            <p className="text-sm text-gray-500">
              No checks yet.{" "}
              {baseline
                ? "Run the first check to verify the live listing."
                : "Confirm the baseline first, then run a check."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500 dark:border-gray-700">
                  <th className="py-2 pr-3 font-medium">When</th>
                  <th className="py-2 pr-3 font-medium">Result</th>
                  <th className="py-2 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((c) => {
                  const display = checkStatusDisplay(c.status);
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-gray-100 last:border-0 dark:border-gray-800"
                    >
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {c.runAt.toISOString().slice(0, 16).replace("T", " ")}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge color={display.color}>{display.label}</Badge>
                      </td>
                      <td className="py-2 text-gray-500">
                        {c.status === "drift"
                          ? (c.driftFields ?? "")
                              .split(",")
                              .filter(Boolean)
                              .map(fieldLabel)
                              .join(", ")
                          : c.status === "error"
                            ? c.error
                            : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
