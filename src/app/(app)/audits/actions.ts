"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireRole, requireSession } from "@/lib/session";

const OPEN_STATUSES = ["backlog", "todo", "in_progress", "waiting", "blocked"];

function revalidateAudit(auditId: string, locationId?: string) {
  revalidatePath(`/audits/${auditId}`);
  if (locationId) revalidatePath(`/locations/${locationId}`);
}

/** Starts an audit against the latest template version. */
export async function startAudit(locationId: string) {
  const session = await requireRole("admin", "operator", "va");
  const db = await getDb();

  const [latestTemplate] = await db
    .select()
    .from(schema.auditTemplates)
    .orderBy(desc(schema.auditTemplates.version))
    .limit(1);
  if (!latestTemplate) return;

  const [audit] = await db
    .insert(schema.audits)
    .values({
      locationId,
      templateId: latestTemplate.id,
      status: "in_progress",
      runBy: session.user.id,
    })
    .returning({ id: schema.audits.id });

  revalidatePath(`/locations/${locationId}`);
  redirect(`/audits/${audit.id}`);
}

/** Records (or re-records) a finding for one audit item. */
export async function setFinding(
  auditId: string,
  auditItemId: string,
  formData: FormData,
) {
  await requireSession();
  const status = String(formData.get("status") ?? "");
  if (!["pass", "fail", "na"].includes(status)) return;
  const note = String(formData.get("note") ?? "").trim() || null;

  const db = await getDb();
  const [audit, item] = await Promise.all([
    db.query.audits.findFirst({ where: eq(schema.audits.id, auditId) }),
    db.query.auditItems.findFirst({
      where: eq(schema.auditItems.id, auditItemId),
    }),
  ]);
  if (!audit || audit.status !== "in_progress" || !item) return;

  const existing = await db.query.findings.findFirst({
    where: and(
      eq(schema.findings.auditId, auditId),
      eq(schema.findings.auditItemId, auditItemId),
    ),
  });

  if (existing) {
    await db
      .update(schema.findings)
      .set({ status, note })
      .where(eq(schema.findings.id, existing.id));
  } else {
    await db.insert(schema.findings).values({
      auditId,
      auditItemId,
      status,
      note,
      severity: item.defaultSeverity,
      // Snapshot the displayed text so history stays trustworthy
      snapshotTitle: item.checkTitle,
      snapshotQuestion: item.checkQuestion,
    });
  }
  revalidateAudit(auditId, audit.locationId);
}

/**
 * Creates a task for a failed finding — or links the finding to an
 * already-open task for the same check on this location (duplicate
 * detection via the audit item's stable key).
 */
export async function createTaskFromFinding(findingId: string) {
  const session = await requireSession();
  const db = await getDb();

  const finding = await db.query.findings.findFirst({
    where: eq(schema.findings.id, findingId),
  });
  if (!finding || finding.status !== "fail" || finding.taskId) return;

  const [audit, item] = await Promise.all([
    db.query.audits.findFirst({ where: eq(schema.audits.id, finding.auditId) }),
    db.query.auditItems.findFirst({
      where: eq(schema.auditItems.id, finding.auditItemId),
    }),
  ]);
  if (!audit || !item) return;

  let template = null;
  if (item.taskTemplateKey) {
    template =
      (await db.query.taskTemplates.findFirst({
        where: and(
          eq(schema.taskTemplates.key, item.taskTemplateKey),
          eq(schema.taskTemplates.isActive, true),
        ),
      })) ?? null;
  }

  // Duplicate detection: an open task for the same check on this location
  // (from a previous audit), or an open task from the same template (e.g. a
  // recurring ops task already covering this work).
  let [existingTask] = await db
    .select()
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.locationId, audit.locationId),
        eq(schema.tasks.sourceStableKey, item.stableKey),
        inArray(schema.tasks.status, OPEN_STATUSES),
      ),
    )
    .limit(1);
  if (!existingTask && template) {
    [existingTask] = await db
      .select()
      .from(schema.tasks)
      .where(
        and(
          eq(schema.tasks.locationId, audit.locationId),
          eq(schema.tasks.templateId, template.id),
          inArray(schema.tasks.status, OPEN_STATUSES),
        ),
      )
      .limit(1);
  }

  if (existingTask) {
    await db
      .update(schema.findings)
      .set({ taskId: existingTask.id })
      .where(eq(schema.findings.id, findingId));
    revalidateAudit(finding.auditId, audit.locationId);
    return;
  }

  const severityPriority =
    item.defaultSeverity === "critical"
      ? "p1"
      : item.defaultSeverity === "important"
        ? "p2"
        : "p3";

  const [task] = await db
    .insert(schema.tasks)
    .values({
      locationId: audit.locationId,
      templateId: template?.id ?? null,
      title: template?.title ?? `Fix: ${item.checkTitle}`,
      taskType: template?.taskType ?? "profile",
      priority: template?.defaultPriority ?? severityPriority,
      riskLevel: template?.defaultRisk ?? item.riskLevel,
      status: "todo",
      dueDate: new Date(
        Date.now() + (template?.defaultDueDays ?? 7) * 86400000,
      ),
      instructions:
        template?.instructions ??
        [
          `Audit finding: ${item.checkTitle}`,
          item.recommendedAction ? `Action: ${item.recommendedAction}` : null,
          finding.note ? `Auditor note: ${finding.note}` : null,
        ]
          .filter(Boolean)
          .join("\n\n"),
      definitionOfDone: template?.definitionOfDone ?? item.recommendedAction,
      approvalRequired: template?.approvalRequired ?? item.riskLevel === "high",
      sourceStableKey: item.stableKey,
      createdBy: session.user.id,
    })
    .returning({ id: schema.tasks.id });

  await db
    .update(schema.findings)
    .set({ taskId: task.id })
    .where(eq(schema.findings.id, findingId));

  revalidateAudit(finding.auditId, audit.locationId);
  revalidatePath("/tasks");
}

export async function completeAudit(auditId: string) {
  await requireSession();
  const db = await getDb();
  const audit = await db.query.audits.findFirst({
    where: eq(schema.audits.id, auditId),
  });
  if (!audit || audit.status !== "in_progress") return;

  await db
    .update(schema.audits)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(schema.audits.id, auditId));
  revalidateAudit(auditId, audit.locationId);
}
