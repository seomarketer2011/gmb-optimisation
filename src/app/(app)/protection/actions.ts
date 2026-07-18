"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { str } from "@/lib/form";
import { getGoogleMapsKey, MISSING_KEY_ERROR } from "@/lib/google-key";
import { requireRole, requireSession } from "@/lib/session";
import { fetchLiveListing } from "@/lib/places";
import {
  diffBaseline,
  parseBaselineHours,
  snapshotOf,
  type BaselineValues,
  type FieldDiff,
  type LiveValues,
} from "@/lib/integrity";

type Db = Awaited<ReturnType<typeof getDb>>;
type LocationRow = typeof schema.locations.$inferSelect;
type BaselineRow = typeof schema.gbpBaselines.$inferSelect;

function revalidateProtection(locationId: string) {
  revalidatePath("/protection");
  revalidatePath(`/locations/${locationId}/protection`);
  revalidatePath(`/locations/${locationId}`);
}

function toBaselineValues(row: BaselineRow): BaselineValues {
  return {
    businessName: row.businessName,
    address: row.address,
    phone: row.phone,
    primaryCategory: row.primaryCategory,
    hours: parseBaselineHours(row.hours),
    businessStatus: row.businessStatus,
    latitude: row.latitude,
    longitude: row.longitude,
  };
}

/**
 * Save the confirmed source-of-truth data for a property. Only operators and
 * admins define truth — this is what every future check compares against.
 *
 * Open/closed status and the map pin come from hidden inputs carrying the
 * live values the operator SAW on the page — never re-fetched here, and never
 * overwritten once captured, so a hijacked live value can't be silently
 * adopted into the baseline by an unrelated edit. (Accepting a changed value
 * is an explicit act: dismissing its alert.)
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

  const existing = await db.query.gbpBaselines.findFirst({
    where: eq(schema.gbpBaselines.locationId, locationId),
  });

  const num = (v: FormDataEntryValue | null) => {
    const n = parseFloat(String(v ?? ""));
    return Number.isFinite(n) ? n : null;
  };
  const businessStatus =
    existing?.businessStatus ?? str(formData.get("liveBusinessStatus"));
  const latitude = existing?.latitude ?? num(formData.get("liveLatitude"));
  const longitude = existing?.longitude ?? num(formData.get("liveLongitude"));

  const values = {
    businessName,
    address: str(formData.get("address")),
    phone: str(formData.get("phone")),
    primaryCategory: str(formData.get("primaryCategory")),
    hours: JSON.stringify(hours),
    businessStatus,
    latitude,
    longitude,
    confirmedBy: session.user.id,
    confirmedAt: new Date(),
  };

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

const RESTORE_DUE_DAYS = 1; // restoring hijacked data is always urgent

function restoreInstructions(d: FieldDiff, location: LocationRow): string {
  const what = d.label.toLowerCase();
  return [
    `A data-protection check found that Google is showing different ${what} data than our confirmed baseline. This usually means a Google "suggested edit" was applied to the listing.`,
    `CORRECT value (our confirmed baseline):\n${d.expected}`,
    `Google currently shows:\n${d.live}`,
    `Steps:\n1. Open the listing${location.gbpUrl ? ` (${location.gbpUrl})` : ""} and sign in to the Business Profile manager.\n2. Edit profile → set the ${what} back to the correct value above.\n3. Record the edit in the property's change log.\n4. Mark the alert resolved on the property's Protection page once Google shows the correct value again.`,
  ].join("\n\n");
}

async function recordErrorCheck(
  db: Db,
  locationId: string,
  userId: string,
  error: string,
) {
  await db.insert(schema.integrityChecks).values({
    locationId,
    status: "error",
    error,
    runBy: userId,
  });
}

/**
 * One open alert per field per property. A repeat detection updates the
 * existing alert (recording the previous sighting in its notes and
 * refreshing the linked task's instructions); a new field gets an alert plus
 * an urgent VA task with restore instructions.
 */
async function raiseAlert(
  db: Db,
  userId: string,
  location: LocationRow,
  checkId: string,
  d: FieldDiff,
  existing: typeof schema.integrityAlerts.$inferSelect | undefined,
) {
  if (existing) {
    if (existing.liveValue !== d.live) {
      // The live value drifted AGAIN — keep the audit trail and keep the
      // VA's task instructions in sync with what Google now shows
      const history = `Previously showed (detected ${existing.createdAt.toISOString().slice(0, 10)}):\n${existing.liveValue}`;
      await db
        .update(schema.integrityAlerts)
        .set({
          checkId,
          expectedValue: d.expected,
          liveValue: d.live,
          notes: [existing.notes, history].filter(Boolean).join("\n\n"),
        })
        .where(eq(schema.integrityAlerts.id, existing.id));
      if (existing.taskId) {
        await db
          .update(schema.tasks)
          .set({ instructions: restoreInstructions(d, location) })
          .where(
            and(
              eq(schema.tasks.id, existing.taskId),
              inArray(schema.tasks.status, [
                "backlog",
                "todo",
                "in_progress",
                "waiting",
                "blocked",
              ]),
            ),
          );
      }
    } else {
      await db
        .update(schema.integrityAlerts)
        .set({ checkId })
        .where(eq(schema.integrityAlerts.id, existing.id));
    }
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
      dueDate: new Date(Date.now() + RESTORE_DUE_DAYS * 86400000),
      instructions: restoreInstructions(d, location),
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

async function checkOne(
  db: Db,
  apiKey: string,
  userId: string,
  location: LocationRow,
  baselineRow: BaselineRow,
): Promise<void> {
  try {
    const result = await fetchLiveListing(location, apiKey);
    if (!result.ok) {
      await recordErrorCheck(db, location.id, userId, result.error);
      return;
    }
    const live = result.data;
    const baseline = toBaselineValues(baselineRow);
    const diffs = diffBaseline(baseline, live);

    // A URL-based lookup is a text search — it can land on the wrong
    // listing. Only trust (and pin) it when the business name matches the
    // baseline; otherwise report the mismatch instead of raising false
    // hijack alerts against a listing that may not be ours.
    if (result.via === "url") {
      const nameDiff = diffs.find((f) => f.field === "business_name");
      if (nameDiff?.changed) {
        await recordErrorCheck(
          db,
          location.id,
          userId,
          `Resolving the GBP URL found "${live.name}", which doesn't match the confirmed business name — either the listing was renamed or the wrong listing was matched. Set the Google Place ID on the property form to pin the correct listing, then re-run the check.`,
        );
        return;
      }
      if (!location.placeId && live.placeId) {
        await db
          .update(schema.locations)
          .set({ placeId: live.placeId })
          .where(eq(schema.locations.id, location.id));
      }
    }

    const drift = diffs.filter((f) => f.changed);

    const [check] = await db
      .insert(schema.integrityChecks)
      .values({
        locationId: location.id,
        status: drift.length > 0 ? "drift" : "ok",
        driftFields: drift.length ? drift.map((f) => f.field).join(",") : null,
        liveSnapshot: JSON.stringify(snapshotOf(live)),
        runBy: userId,
      })
      .returning({ id: schema.integrityChecks.id });

    if (drift.length > 0) {
      // One query for all open alerts on this property, not one per field
      const openAlerts = await db
        .select()
        .from(schema.integrityAlerts)
        .where(
          and(
            eq(schema.integrityAlerts.locationId, location.id),
            eq(schema.integrityAlerts.status, "open"),
          ),
        );
      const byField = new Map(openAlerts.map((a) => [a.field, a]));
      for (const d of drift) {
        await raiseAlert(db, userId, location, check.id, d, byField.get(d.field));
      }
    }
  } catch (e) {
    // A single property's failure must never abort a portfolio sweep
    await recordErrorCheck(
      db,
      location.id,
      userId,
      `Check failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
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

  const apiKey = await getGoogleMapsKey();
  if (!apiKey) {
    await recordErrorCheck(db, locationId, session.user.id, MISSING_KEY_ERROR);
  } else {
    await checkOne(db, apiKey, session.user.id, location, baselineRow);
  }
  revalidatePath("/tasks");
  revalidateProtection(locationId);
}

const SWEEP_CONCURRENCY = 5;

/** Run a check for every active property that has a confirmed baseline. */
export async function runAllIntegrityChecks() {
  const session = await requireSession();
  const db = await getDb();

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

  const apiKey = await getGoogleMapsKey();
  if (!apiKey) {
    // Record the failure once per property so check history tells the truth
    for (const { location } of rows) {
      await recordErrorCheck(db, location.id, session.user.id, MISSING_KEY_ERROR);
    }
  } else {
    for (let i = 0; i < rows.length; i += SWEEP_CONCURRENCY) {
      await Promise.all(
        rows
          .slice(i, i + SWEEP_CONCURRENCY)
          .map(({ location, baseline }) =>
            checkOne(db, apiKey, session.user.id, location, baseline),
          ),
      );
    }
  }

  revalidatePath("/protection");
  revalidatePath("/tasks");
  for (const { location } of rows) {
    revalidatePath(`/locations/${location.id}/protection`);
    revalidatePath(`/locations/${location.id}`);
  }
}

/**
 * Dismissing an alert means the flagged value is acceptable — so it becomes
 * the new baseline for that field (from the snapshot of the very check the
 * alert points at), which stops it re-flagging.
 */
async function adoptLiveValue(
  db: Db,
  alert: typeof schema.integrityAlerts.$inferSelect,
) {
  if (!alert.checkId) return;
  const check = await db.query.integrityChecks.findFirst({
    where: eq(schema.integrityChecks.id, alert.checkId),
  });
  if (!check?.liveSnapshot) return;
  let snap: Partial<LiveValues>;
  try {
    snap = JSON.parse(check.liveSnapshot);
  } catch {
    return;
  }

  const set: Partial<typeof schema.gbpBaselines.$inferInsert> = {};
  switch (alert.field) {
    case "business_name":
      if (snap.name) set.businessName = snap.name;
      break;
    case "address":
      set.address = snap.address ?? null;
      break;
    case "phone":
      set.phone = snap.phone ?? null;
      break;
    case "primary_category":
      set.primaryCategory = snap.primaryCategory ?? null;
      break;
    case "hours":
      if (Array.isArray(snap.hours)) set.hours = JSON.stringify(snap.hours);
      break;
    case "business_status":
      if (snap.businessStatus) set.businessStatus = snap.businessStatus;
      break;
    case "map_pin":
      if (snap.latitude != null && snap.longitude != null) {
        set.latitude = snap.latitude;
        set.longitude = snap.longitude;
      }
      break;
  }
  if (Object.keys(set).length === 0) return;
  await db
    .update(schema.gbpBaselines)
    .set(set)
    .where(eq(schema.gbpBaselines.locationId, alert.locationId));
}

const OPEN_TASK_STATUSES = ["backlog", "todo", "in_progress", "waiting", "blocked"];

/**
 * Close an alert. "resolved" = the correct data is back live (any team
 * member, typically after completing the restore task). "dismissed" = an
 * operator accepted the flagged value — it is adopted into the baseline and
 * the restore task is cancelled. Either way the linked task is closed too,
 * so the alert and its task can never contradict each other.
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

  if (alert.taskId) {
    await db
      .update(schema.tasks)
      .set(
        status === "resolved"
          ? {
              status: "done",
              completedBy: session.user.id,
              completedAt: new Date(),
            }
          : { status: "rejected" },
      )
      .where(
        and(
          eq(schema.tasks.id, alert.taskId),
          inArray(schema.tasks.status, OPEN_TASK_STATUSES),
        ),
      );
    revalidatePath("/tasks");
    revalidatePath(`/tasks/${alert.taskId}`);
  }

  if (status === "dismissed") {
    await adoptLiveValue(db, alert);
  }
  revalidateProtection(alert.locationId);
}
