"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb, schema } from "@/db";
import { requireRole, requireSession } from "@/lib/session";
import { fetchPlaceDetails, lookupGbpFromUrl } from "@/lib/places";
import {
  diffBaseline,
  parseBaselineHours,
  type BaselineValues,
  type FieldDiff,
} from "@/lib/integrity";

function str(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
}

function revalidateProtection(locationId: string) {
  revalidatePath("/protection");
  revalidatePath(`/locations/${locationId}/protection`);
  revalidatePath(`/locations/${locationId}`);
}

/**
 * Save the confirmed source-of-truth data for a property. Only operators and
 * admins define truth — this is what every future check compares against.
 */
export async function confirmBaseline(locationId: string, formData: FormData) {
  const session = await requireRole("admin", "operator");
  const db = await getDb();

  const businessName = str(formData.get("businessName"));
  if (!businessName) return;

  const hours = String(formData.get("hours") ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const values = {
    businessName,
    address: str(formData.get("address")),
    phone: str(formData.get("phone")),
    primaryCategory: str(formData.get("primaryCategory")),
    hours: JSON.stringify(hours),
    confirmedBy: session.user.id,
    confirmedAt: new Date(),
  };

  const existing = await db.query.gbpBaselines.findFirst({
    where: eq(schema.gbpBaselines.locationId, locationId),
  });
  if (existing) {
    await db
      .update(schema.gbpBaselines)
      .set(values)
      .where(eq(schema.gbpBaselines.id, existing.id));
  } else {
    await db.insert(schema.gbpBaselines).values({ locationId, ...values });
  }
  revalidateProtection(locationId);
}

const FIELD_DUE_DAYS = 1; // restoring hijacked data is always urgent

async function checkOne(
  db: Awaited<ReturnType<typeof getDb>>,
  apiKey: string,
  userId: string,
  location: typeof schema.locations.$inferSelect,
  baselineRow: typeof schema.gbpBaselines.$inferSelect,
): Promise<void> {
  const result = location.placeId
    ? await fetchPlaceDetails(location.placeId, apiKey)
    : location.gbpUrl
      ? await lookupGbpFromUrl(location.gbpUrl, apiKey)
      : ({ ok: false, error: "No place ID or GBP URL on this property." } as const);

  if (!result.ok) {
    await db.insert(schema.integrityChecks).values({
      locationId: location.id,
      status: "error",
      error: result.error,
      runBy: userId,
    });
    return;
  }
  const live = result.data;

  // Older imports stored the place ID only in notes — capture it now so the
  // next check fetches by ID instead of text search
  if (!location.placeId && live.placeId) {
    await db
      .update(schema.locations)
      .set({ placeId: live.placeId })
      .where(eq(schema.locations.id, location.id));
  }

  const baseline: BaselineValues = {
    businessName: baselineRow.businessName,
    address: baselineRow.address,
    phone: baselineRow.phone,
    primaryCategory: baselineRow.primaryCategory,
    hours: parseBaselineHours(baselineRow.hours),
  };

  const drift = diffBaseline(baseline, live).filter((d) => d.changed);

  const [check] = await db
    .insert(schema.integrityChecks)
    .values({
      locationId: location.id,
      status: drift.length > 0 ? "drift" : "ok",
      driftFields: drift.length ? drift.map((d) => d.field).join(",") : null,
      liveSnapshot: JSON.stringify({
        name: live.name,
        address: live.address,
        phone: live.phone,
        primaryCategory: live.primaryCategory,
        hours: live.hours,
      }),
      runBy: userId,
    })
    .returning({ id: schema.integrityChecks.id });

  for (const d of drift) {
    await raiseAlert(db, userId, location, check.id, d);
  }
}

/**
 * One open alert per field per property. A repeat detection updates the
 * existing alert instead of piling up duplicates; a new field gets an alert
 * plus an urgent VA task with restore instructions.
 */
async function raiseAlert(
  db: Awaited<ReturnType<typeof getDb>>,
  userId: string,
  location: typeof schema.locations.$inferSelect,
  checkId: string,
  d: FieldDiff,
) {
  const existing = await db.query.integrityAlerts.findFirst({
    where: and(
      eq(schema.integrityAlerts.locationId, location.id),
      eq(schema.integrityAlerts.field, d.field),
      eq(schema.integrityAlerts.status, "open"),
    ),
  });
  if (existing) {
    await db
      .update(schema.integrityAlerts)
      .set({ checkId, expectedValue: d.expected, liveValue: d.live })
      .where(eq(schema.integrityAlerts.id, existing.id));
    return;
  }

  const [task] = await db
    .insert(schema.tasks)
    .values({
      locationId: location.id,
      title: `Google changed ${d.label.toLowerCase()} — restore correct data`,
      taskType: "monitoring",
      priority: "p1",
      riskLevel: d.risk,
      status: "todo",
      dueDate: new Date(Date.now() + FIELD_DUE_DAYS * 86400000),
      instructions: [
        `A data-protection check found that Google is showing different ${d.label.toLowerCase()} data than our confirmed baseline. This usually means a Google "suggested edit" was applied to the listing.`,
        `CORRECT value (our confirmed baseline):\n${d.expected}`,
        `Google currently shows:\n${d.live}`,
        `Steps:\n1. Open the listing${location.gbpUrl ? ` (${location.gbpUrl})` : ""} and sign in to the Business Profile manager.\n2. Edit profile → set the ${d.label.toLowerCase()} back to the correct value above.\n3. Record the edit in the property's change log.\n4. Mark the alert resolved on the property's Protection page once Google shows the correct value again.`,
      ].join("\n\n"),
      definitionOfDone: `Google publicly shows the confirmed ${d.label.toLowerCase()} again and the alert is resolved.`,
      createdBy: userId,
    })
    .returning({ id: schema.tasks.id });

  await db.insert(schema.integrityAlerts).values({
    locationId: location.id,
    checkId,
    field: d.field,
    expectedValue: d.expected,
    liveValue: d.live,
    taskId: task.id,
  });
}

/** Re-fetch the live listing and compare against the confirmed baseline. */
export async function runIntegrityCheck(locationId: string) {
  const session = await requireSession();
  const db = await getDb();

  const [location, baselineRow] = await Promise.all([
    db.query.locations.findFirst({
      where: eq(schema.locations.id, locationId),
    }),
    db.query.gbpBaselines.findFirst({
      where: eq(schema.gbpBaselines.locationId, locationId),
    }),
  ]);
  if (!location || !baselineRow) return;

  const { env } = await getCloudflareContext({ async: true });
  const apiKey = env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    await db.insert(schema.integrityChecks).values({
      locationId,
      status: "error",
      error:
        "GOOGLE_MAPS_API_KEY is not configured — add the secret to run live checks.",
      runBy: session.user.id,
    });
    revalidateProtection(locationId);
    return;
  }

  await checkOne(db, apiKey, session.user.id, location, baselineRow);
  revalidatePath("/tasks");
  revalidateProtection(locationId);
}

/** Run a check for every active property that has a confirmed baseline. */
export async function runAllIntegrityChecks() {
  const session = await requireSession();
  const db = await getDb();

  const { env } = await getCloudflareContext({ async: true });
  const apiKey = env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return;

  const rows = await db
    .select({
      location: schema.locations,
      baseline: schema.gbpBaselines,
    })
    .from(schema.gbpBaselines)
    .innerJoin(
      schema.locations,
      eq(schema.gbpBaselines.locationId, schema.locations.id),
    )
    .where(inArray(schema.locations.status, ["active", "onboarding"]));

  for (const { location, baseline } of rows) {
    await checkOne(db, apiKey, session.user.id, location, baseline);
    revalidatePath(`/locations/${location.id}/protection`);
    revalidatePath(`/locations/${location.id}`);
  }
  revalidatePath("/protection");
  revalidatePath("/tasks");
}

/**
 * Close an alert. "resolved" = the correct data is back live (any team
 * member, typically after completing the restore task). "dismissed" = an
 * operator decided the flagged value is acceptable — update the baseline
 * too if Google's version is actually correct.
 */
export async function setAlertStatus(alertId: string, status: string) {
  const session =
    status === "dismissed"
      ? await requireRole("admin", "operator")
      : await requireSession();
  if (status !== "resolved" && status !== "dismissed") return;

  const db = await getDb();
  const alert = await db.query.integrityAlerts.findFirst({
    where: eq(schema.integrityAlerts.id, alertId),
  });
  if (!alert || alert.status !== "open") return;

  await db
    .update(schema.integrityAlerts)
    .set({ status, resolvedBy: session.user.id, resolvedAt: new Date() })
    .where(eq(schema.integrityAlerts.id, alertId));
  revalidateProtection(alert.locationId);
}
