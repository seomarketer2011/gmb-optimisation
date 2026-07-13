"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireSession } from "@/lib/session";
import { findStep, playbook, stepStableKey } from "@/lib/playbook";

const OPEN_STATUSES = ["backlog", "todo", "in_progress", "waiting", "blocked"];

function revalidate(locationId: string) {
  revalidatePath(`/locations/${locationId}/playbook`);
  revalidatePath(`/locations/${locationId}`);
  revalidatePath("/tasks");
  revalidatePath("/gbp");
}

async function createStepTask(
  locationId: string,
  stepKey: string,
  userId: string,
  markDone: boolean,
) {
  const step = findStep(stepKey);
  if (!step) return;
  const db = await getDb();
  const stableKey = stepStableKey(stepKey);

  // Don't duplicate: skip if the step already has an open task or was
  // already completed.
  const [latest] = await db
    .select()
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.locationId, locationId),
        eq(schema.tasks.sourceStableKey, stableKey),
      ),
    )
    .orderBy(desc(schema.tasks.createdAt))
    .limit(1);
  if (
    latest &&
    (OPEN_STATUSES.includes(latest.status) ||
      ["done", "validated"].includes(latest.status))
  ) {
    return;
  }

  await db.insert(schema.tasks).values({
    locationId,
    title: step.title,
    taskType: "profile",
    priority: step.priority ?? "p2",
    riskLevel: "low",
    status: markDone ? "done" : "todo",
    ownerId: markDone ? userId : null,
    dueDate: markDone ? null : new Date(Date.now() + 7 * 86400000),
    instructions: `${step.goal}\n\n${step.instructions}`,
    definitionOfDone: step.done_when,
    approvalRequired: false,
    sourceStableKey: stableKey,
    completedBy: markDone ? userId : null,
    completedAt: markDone ? new Date() : null,
    createdBy: userId,
  });
}

export async function startPlaybookStep(locationId: string, stepKey: string) {
  const session = await requireSession();
  await createStepTask(locationId, stepKey, session.user.id, false);
  revalidate(locationId);
}

/** For properties that are already live: record the step as already done. */
export async function markStepAlreadyDone(
  locationId: string,
  stepKey: string,
) {
  const session = await requireSession();
  const db = await getDb();
  const stableKey = stepStableKey(stepKey);

  // If there's an open task for this step, complete it instead of duplicating.
  const [open] = await db
    .select()
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.locationId, locationId),
        eq(schema.tasks.sourceStableKey, stableKey),
        inArray(schema.tasks.status, OPEN_STATUSES),
      ),
    )
    .limit(1);

  if (open) {
    await db
      .update(schema.tasks)
      .set({
        status: "done",
        completedBy: session.user.id,
        completedAt: new Date(),
      })
      .where(eq(schema.tasks.id, open.id));
  } else {
    await createStepTask(locationId, stepKey, session.user.id, true);
  }
  revalidate(locationId);
}

/** Create tasks for every not-started step in a phase. */
export async function startPhase(locationId: string, phaseKey: string) {
  const session = await requireSession();
  const phase = playbook.phases.find((p) => p.key === phaseKey);
  if (!phase) return;
  const db = await getDb();

  const stableKeys = phase.steps.map((s) => stepStableKey(s.key));
  const existing = await db
    .select({ key: schema.tasks.sourceStableKey })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.locationId, locationId),
        inArray(schema.tasks.sourceStableKey, stableKeys),
      ),
    );
  const existingKeys = new Set(existing.map((e) => e.key));

  for (const step of phase.steps) {
    if (existingKeys.has(stepStableKey(step.key))) continue;
    await createStepTask(locationId, step.key, session.user.id, false);
  }
  revalidate(locationId);
}
