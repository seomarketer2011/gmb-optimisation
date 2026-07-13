import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb, schema } from "@/db";
import { requireSession } from "@/lib/session";
import { fetchPlaceDetails, lookupGbpFromUrl } from "@/lib/places";
import {
  businessStatusLabel,
  formatPin,
  hoursToText,
  parseBaselineHours,
  PROTECTED_FIELDS,
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

const fieldLabel = (key: string) =>
  PROTECTED_FIELDS.find((f) => f.key === key)?.label ?? key;

export default async function ProtectionPage({
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

  // First visit: pre-fill the form from the live listing so confirming is a
  // review, not data entry. Falls back to the stored property fields.
  let prefill = {
    businessName: baseline?.businessName ?? location.name,
    address: baseline?.address ?? location.address ?? "",
    phone: baseline?.phone ?? location.phone ?? "",
    primaryCategory: baseline?.primaryCategory ?? location.primaryCategory ?? "",
    hours: baseline ? hoursToText(parseBaselineHours(baseline.hours)) : "",
  };
  // Open/closed status + map pin are captured automatically, shown read-only
  let monitored = baseline
    ? {
        status: businessStatusLabel(baseline.businessStatus),
        pin: formatPin(baseline.latitude, baseline.longitude),
      }
    : { status: "—", pin: "—" };
  let prefilledLive = false;
  if (!baseline) {
    const { env } = await getCloudflareContext({ async: true });
    const apiKey = env.GOOGLE_MAPS_API_KEY;
    if (apiKey && (location.placeId || location.gbpUrl)) {
      const result = location.placeId
        ? await fetchPlaceDetails(location.placeId, apiKey)
        : await lookupGbpFromUrl(location.gbpUrl!, apiKey);
      if (result.ok) {
        prefill = {
          businessName: result.data.name,
          address: result.data.address ?? "",
          phone: result.data.phone ?? "",
          primaryCategory: result.data.primaryCategory ?? "",
          hours: hoursToText(result.data.hours),
        };
        monitored = {
          status: businessStatusLabel(result.data.businessStatus),
          pin: formatPin(result.data.latitude, result.data.longitude),
        };
        prefilledLive = true;
      }
    }
  }

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
                  <form action={setAlertStatus.bind(null, a.id, "dismissed")}>
                    <Button type="submit" variant="secondary">
                      Dismiss
                    </Button>
                  </form>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Resolve once Google shows the correct value again. Dismiss
            (operators) only if the new value is acceptable — and update the
            baseline below so it stops flagging.
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
                Confirmed{" "}
                {baseline.confirmedAt.toISOString().slice(0, 10)}
                {confirmedByUser ? ` by ${confirmedByUser.name}` : ""}. Every
                check compares Google&rsquo;s live listing against these
                values.
              </>
            ) : prefilledLive ? (
              "Pre-filled from the live Google listing. Check every field against reality — this becomes the source of truth."
            ) : (
              "Pre-filled from the property record. Check every field against reality — this becomes the source of truth."
            )}
          </p>
          <form action={confirm} className="space-y-3">
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
                  Map pin: <span className="font-medium">{monitored.pin}</span>
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Fields left blank are not protected. Open/closed status and the
              map pin are snapshotted from the live listing when you confirm.
              Operator or admin role required to confirm.
            </p>
            <Button type="submit">
              {baseline ? "Update baseline" : "Confirm baseline"}
            </Button>
          </form>
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
                {checks.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-gray-100 last:border-0 dark:border-gray-800"
                  >
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {c.runAt.toISOString().slice(0, 16).replace("T", " ")}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge
                        color={
                          c.status === "ok"
                            ? "green"
                            : c.status === "drift"
                              ? "red"
                              : "yellow"
                        }
                      >
                        {c.status === "ok"
                          ? "all correct"
                          : c.status === "drift"
                            ? "data changed"
                            : "error"}
                      </Badge>
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
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
