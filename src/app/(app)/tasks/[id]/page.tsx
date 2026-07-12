import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireSession } from "@/lib/session";
import {
  Badge,
  Button,
  Card,
  Input,
  Label,
  PageHeader,
  Textarea,
  statusBadgeColor,
} from "@/components/ui";
import { CopyButton } from "@/components/copy-button";
import { TaskComplete } from "@/components/task-complete";
import { EvidenceUpload } from "@/components/evidence-upload";
import {
  addTextEvidence,
  approveTask,
  claimTask,
  setTaskStatus,
} from "../actions";

export const dynamic = "force-dynamic";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const role = (session.user as { role?: string }).role ?? "va";
  const { id } = await params;
  const db = await getDb();

  const task = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, id),
  });
  if (!task) notFound();

  const [location, template, owner, evidence, content] = await Promise.all([
    db.query.locations.findFirst({
      where: eq(schema.locations.id, task.locationId),
    }),
    task.templateId
      ? db.query.taskTemplates.findFirst({
          where: eq(schema.taskTemplates.id, task.templateId),
        })
      : Promise.resolve(null),
    task.ownerId
      ? db.query.user.findFirst({ where: eq(schema.user.id, task.ownerId) })
      : Promise.resolve(null),
    db
      .select()
      .from(schema.taskEvidence)
      .where(eq(schema.taskEvidence.taskId, id))
      .orderBy(asc(schema.taskEvidence.createdAt)),
    db
      .select()
      .from(schema.contentItems)
      .where(eq(schema.contentItems.taskId, id))
      .orderBy(asc(schema.contentItems.createdAt)),
  ]);

  const isOpen = !["done", "validated", "rejected"].includes(task.status);
  const needsApproval = task.approvalRequired && !task.approvedBy;
  const canApprove = role === "admin" || role === "operator";

  const statusForm = (status: string, label: string) => {
    const action = setTaskStatus.bind(null, task.id, status);
    return (
      <form action={action}>
        <Button type="submit" variant="secondary">
          {label}
        </Button>
      </form>
    );
  };

  return (
    <div>
      <PageHeader
        title={task.title}
        subtitle={
          location ? (
            <>
              <Link
                href={`/locations/${location.id}`}
                className="text-blue-600 hover:underline"
              >
                {location.name}
              </Link>
              {template && <> · from template “{template.title}”</>}
            </>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge color={statusBadgeColor(task.status)}>
          {task.status.replace("_", " ")}
        </Badge>
        <Badge
          color={
            task.priority === "p1"
              ? "red"
              : task.priority === "p2"
                ? "yellow"
                : "gray"
          }
        >
          {task.priority.toUpperCase()}
        </Badge>
        <Badge
          color={
            task.riskLevel === "high"
              ? "red"
              : task.riskLevel === "medium"
                ? "yellow"
                : "gray"
          }
        >
          risk: {task.riskLevel}
        </Badge>
        {task.dueDate && (
          <span className="text-sm text-gray-500">
            Due {task.dueDate.toISOString().slice(0, 10)}
          </span>
        )}
        <span className="text-sm text-gray-500">
          Owner: {owner?.name ?? "unassigned"}
        </span>
        {!task.ownerId && isOpen && (
          <form action={claimTask.bind(null, task.id)}>
            <button
              type="submit"
              className="text-sm text-blue-600 hover:underline"
            >
              Assign to me
            </button>
          </form>
        )}
      </div>

      {needsApproval && (
        <Card className="mb-4 border-red-300 dark:border-red-800">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-red-700 dark:text-red-400">
              <strong>Approval required.</strong> This is a sensitive change —
              it cannot be completed until an operator or admin approves it.
            </p>
            {canApprove && (
              <form action={approveTask.bind(null, task.id)}>
                <Button type="submit">Approve</Button>
              </form>
            )}
          </div>
        </Card>
      )}
      {task.approvalRequired && task.approvedBy && (
        <p className="mb-4 text-sm text-green-700 dark:text-green-400">
          ✓ Approved
          {task.approvedAt &&
            ` on ${task.approvedAt.toISOString().slice(0, 10)}`}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {task.instructions && (
            <Card>
              <h2 className="mb-2 font-medium">Instructions</h2>
              <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                {task.instructions}
              </p>
            </Card>
          )}
          {task.definitionOfDone && (
            <Card>
              <h2 className="mb-2 font-medium">Definition of done</h2>
              <p className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                {task.definitionOfDone}
              </p>
            </Card>
          )}

          {content.length > 0 && (
            <Card>
              <h2 className="mb-2 font-medium">Prepared content</h2>
              <div className="space-y-3">
                {content.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-md border border-gray-200 p-3 dark:border-gray-700"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        <Link
                          href={`/content/${c.id}`}
                          className="text-blue-600 hover:underline"
                        >
                          {c.title ?? c.contentType}
                        </Link>{" "}
                        <Badge color={statusBadgeColor(c.status)}>
                          {c.status}
                        </Badge>
                      </span>
                      <CopyButton text={c.body} label="Copy text" />
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">
                      {c.body}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <h2 className="mb-3 font-medium">Evidence</h2>
            {evidence.length === 0 ? (
              <p className="mb-3 text-sm text-gray-500">
                No evidence yet. Add before/after screenshots, notes or links.
              </p>
            ) : (
              <ul className="mb-4 space-y-2">
                {evidence.map((e) => (
                  <li
                    key={e.id}
                    className="rounded-md border border-gray-200 p-2 text-sm dark:border-gray-700"
                  >
                    <Badge color="gray">{e.evidenceType}</Badge>{" "}
                    {e.storageKey && (
                      <a
                        href={`/api/evidence/${e.id}`}
                        target="_blank"
                        className="text-blue-600 hover:underline"
                      >
                        {e.originalFilename ?? "file"}
                      </a>
                    )}
                    {e.url && (
                      <a
                        href={e.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {e.url}
                      </a>
                    )}
                    {e.textContent && (
                      <span className="text-gray-700 dark:text-gray-300">
                        {e.textContent}
                      </span>
                    )}
                    {e.caption && (
                      <span className="block text-xs text-gray-500">
                        {e.caption}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {isOpen && (
              <div className="space-y-3">
                <EvidenceUpload taskId={task.id} />
                <form
                  action={addTextEvidence.bind(null, task.id)}
                  className="space-y-2"
                >
                  <div>
                    <Label htmlFor="textContent">Note</Label>
                    <Textarea id="textContent" name="textContent" rows={2} />
                  </div>
                  <div>
                    <Label htmlFor="url">Link (e.g. live post URL)</Label>
                    <Input id="url" name="url" placeholder="https://…" />
                  </div>
                  <Button type="submit" variant="secondary">
                    Add note / link
                  </Button>
                </form>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 font-medium">Actions</h2>
            <div className="flex flex-wrap gap-2">
              {task.status !== "in_progress" &&
                isOpen &&
                statusForm("in_progress", "Start")}
              {task.status !== "waiting" &&
                isOpen &&
                statusForm("waiting", "Waiting")}
              {task.status !== "blocked" &&
                isOpen &&
                statusForm("blocked", "Blocked")}
              {task.status === "done" && statusForm("monitoring", "Monitor")}
              {(task.status === "done" || task.status === "monitoring") &&
                statusForm("validated", "Validate")}
              {!isOpen && statusForm("todo", "Reopen")}
            </div>
            {isOpen && (
              <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
                <TaskComplete
                  taskId={task.id}
                  recurs={Boolean(template?.recurrenceDays)}
                  recurrenceDays={template?.recurrenceDays ?? null}
                />
              </div>
            )}
          </Card>
          <Card>
            <h2 className="mb-2 font-medium">Add content for this task</h2>
            <p className="mb-3 text-sm text-gray-500">
              Prepare the copy-paste content the VA needs (post text, review
              reply, Q&A…).
            </p>
            <Link
              href={`/content/new?locationId=${task.locationId}&taskId=${task.id}`}
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              + Prepare content
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
