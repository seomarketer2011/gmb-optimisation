"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { str } from "@/lib/form";
import { requireRole, requireSession } from "@/lib/session";

const OPEN_STATUSES = ["backlog", "todo", "in_progress", "waiting", "blocked"];

// Statuses any team member may set directly. "done" goes through
// completeTask so the approval gate and recurrence always run.
const DIRECT_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "waiting",
  "blocked",
  "monitoring",
  "validated",
  "rejected",
];

function revalidateTask(taskId: string, locationId?: string) {
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath("/");
  if (locationId) revalidatePath(`/locations/${locationId}`);
}

export async function createTask(formData: FormData) {
  const session = await requireRole("admin", "operator", "va");
  const db = await getDb();

  const locationId = str(formData.get("locationId"));
  if (!locationId) return;

  const templateId = str(formData.get("templateId"));
  let template = null;
  if (templateId) {
    template =
      (await db.query.taskTemplates.findFirst({
        where: eq(schema.taskTemplates.id, templateId),
      })) ?? null;
  }

  const title = str(formData.get("title")) ?? template?.title;
  if (!title) return;

  const dueRaw = str(formData.get("dueDate"));
  const dueDate = dueRaw
    ? new Date(dueRaw)
    : template?.defaultDueDays
      ? new Date(Date.now() + template.defaultDueDays * 86400000)
      : null;

  const [task] = await db
    .insert(schema.tasks)
    .values({
      locationId,
      templateId: template?.id ?? null,
      title,
      taskType: template?.taskType ?? str(formData.get("taskType")) ?? "profile",
      priority: str(formData.get("priority")) ?? template?.defaultPriority ?? "p2",
      riskLevel: template?.defaultRisk ?? "low",
      status: "todo",
      ownerId: str(formData.get("ownerId")),
      dueDate,
      instructions: str(formData.get("instructions")) ?? template?.instructions,
      definitionOfDone: template?.definitionOfDone ?? str(formData.get("definitionOfDone")),
      approvalRequired: template?.approvalRequired ?? false,
      createdBy: session.user.id,
    })
    .returning({ id: schema.tasks.id });

  revalidateTask(task.id, locationId);
  redirect(`/tasks/${task.id}`);
}

/**
 * One-click setup: create a task for every active recurring template that
 * doesn't already have an open task on this location.
 */
export async function setupStandardOpsPlan(locationId: string) {
  const session = await requireRole("admin", "operator");
  const db = await getDb();

  const templates = await db
    .select()
    .from(schema.taskTemplates)
    .where(eq(schema.taskTemplates.isActive, true));
  const recurring = templates.filter((t) => t.recurrenceDays);

  const openTasks = await db
    .select({ templateId: schema.tasks.templateId })
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.locationId, locationId),
        inArray(schema.tasks.status, OPEN_STATUSES),
      ),
    );
  const openTemplateIds = new Set(openTasks.map((t) => t.templateId));

  let created = 0;
  for (const t of recurring) {
    if (openTemplateIds.has(t.id)) continue;
    await db.insert(schema.tasks).values({
      locationId,
      templateId: t.id,
      title: t.title,
      taskType: t.taskType,
      priority: t.defaultPriority,
      riskLevel: t.defaultRisk,
      status: "todo",
      dueDate: new Date(Date.now() + (t.defaultDueDays ?? 7) * 86400000),
      instructions: t.instructions,
      definitionOfDone: t.definitionOfDone,
      approvalRequired: t.approvalRequired,
      createdBy: session.user.id,
    });
    created++;
  }

  revalidatePath("/tasks");
  revalidatePath(`/locations/${locationId}`);
  if (created === 0) return;
}

export async function setTaskStatus(taskId: string, status: string) {
  await requireSession();
  if (!DIRECT_STATUSES.includes(status)) return;
  const db = await getDb();
  const task = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, taskId),
  });
  if (!task) return;
  await db
    .update(schema.tasks)
    .set({ status })
    .where(eq(schema.tasks.id, taskId));
  revalidateTask(taskId, task.locationId);
}

export async function claimTask(taskId: string) {
  const session = await requireSession();
  const db = await getDb();
  const task = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, taskId),
  });
  if (!task) return;
  await db
    .update(schema.tasks)
    .set({ ownerId: session.user.id })
    .where(eq(schema.tasks.id, taskId));
  revalidateTask(taskId, task.locationId);
}

export async function approveTask(taskId: string) {
  const session = await requireRole("admin", "operator");
  const db = await getDb();
  const task = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, taskId),
  });
  if (!task) return;
  await db
    .update(schema.tasks)
    .set({ approvedBy: session.user.id, approvedAt: new Date() })
    .where(eq(schema.tasks.id, taskId));
  revalidateTask(taskId, task.locationId);
}

export type CompleteResult =
  | { ok: true; nextTaskId: string | null }
  | { ok: false; reason: string };

/**
 * Completes a task. Blocked if approval is required but not given.
 * If the task came from a recurring template, schedules the next occurrence.
 */
export async function completeTask(
  taskId: string,
  scheduleNext: boolean,
): Promise<CompleteResult> {
  const session = await requireSession();
  const db = await getDb();

  const task = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, taskId),
  });
  if (!task) return { ok: false, reason: "Task not found" };

  if (task.approvalRequired && !task.approvedBy) {
    return {
      ok: false,
      reason:
        "This task requires operator approval before it can be completed.",
    };
  }

  await db
    .update(schema.tasks)
    .set({
      status: "done",
      completedBy: session.user.id,
      completedAt: new Date(),
    })
    .where(eq(schema.tasks.id, taskId));

  // Completing a data-protection restore task resolves its alert, so the
  // alert and task never disagree about whether the incident is handled
  const [linkedAlert] = await db
    .update(schema.integrityAlerts)
    .set({
      status: "resolved",
      resolvedBy: session.user.id,
      resolvedAt: new Date(),
    })
    .where(
      and(
        eq(schema.integrityAlerts.taskId, taskId),
        eq(schema.integrityAlerts.status, "open"),
      ),
    )
    .returning({ locationId: schema.integrityAlerts.locationId });
  if (linkedAlert) {
    revalidatePath("/protection");
    revalidatePath(`/locations/${linkedAlert.locationId}/protection`);
    revalidatePath(`/locations/${linkedAlert.locationId}`);
  }

  let nextTaskId: string | null = null;
  if (scheduleNext && task.templateId) {
    const template = await db.query.taskTemplates.findFirst({
      where: eq(schema.taskTemplates.id, task.templateId),
    });
    if (template?.recurrenceDays) {
      const [next] = await db
        .insert(schema.tasks)
        .values({
          locationId: task.locationId,
          templateId: template.id,
          title: template.title,
          taskType: template.taskType,
          priority: template.defaultPriority,
          riskLevel: template.defaultRisk,
          status: "todo",
          ownerId: task.ownerId,
          dueDate: new Date(Date.now() + template.recurrenceDays * 86400000),
          instructions: template.instructions,
          definitionOfDone: template.definitionOfDone,
          approvalRequired: template.approvalRequired,
          previousTaskId: task.id,
          createdBy: session.user.id,
        })
        .returning({ id: schema.tasks.id });
      nextTaskId = next.id;
    }
  }

  revalidateTask(taskId, task.locationId);
  return { ok: true, nextTaskId };
}

export async function addTextEvidence(taskId: string, formData: FormData) {
  const session = await requireSession();
  const db = await getDb();
  const task = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, taskId),
  });
  if (!task) return;

  const textContent = str(formData.get("textContent"));
  const url = str(formData.get("url"));
  if (!textContent && !url) return;

  await db.insert(schema.taskEvidence).values({
    taskId,
    evidenceType: url && !textContent ? "link" : "note",
    textContent,
    url,
    caption: str(formData.get("caption")),
    createdBy: session.user.id,
  });
  revalidateTask(taskId, task.locationId);
}
