import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, like, and } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireSession } from "@/lib/session";
import { playbook, stepStableKey, stepStatusFromTask } from "@/lib/playbook";
import {
  Badge,
  Button,
  Card,
  PageHeader,
  statusBadgeColor,
} from "@/components/ui";
import {
  markStepAlreadyDone,
  startPhase,
  startPlaybookStep,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function PlaybookPage({
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

  // Latest task per playbook step for this property
  const stepTasks = await db
    .select()
    .from(schema.tasks)
    .where(
      and(
        eq(schema.tasks.locationId, id),
        like(schema.tasks.sourceStableKey, `pb:${playbook.key}:%`),
      ),
    )
    .orderBy(desc(schema.tasks.createdAt));
  const latestByKey = new Map<string, (typeof stepTasks)[number]>();
  for (const t of stepTasks) {
    if (t.sourceStableKey && !latestByKey.has(t.sourceStableKey)) {
      latestByKey.set(t.sourceStableKey, t);
    }
  }

  const totalSteps = playbook.phases.reduce((n, p) => n + p.steps.length, 0);
  const doneSteps = playbook.phases
    .flatMap((p) => p.steps)
    .filter(
      (s) =>
        stepStatusFromTask(latestByKey.get(stepStableKey(s.key))?.status) ===
        "done",
    ).length;

  return (
    <div>
      <PageHeader
        title={`${playbook.name} — ${location.name}`}
        subtitle={
          <>
            {doneSteps}/{totalSteps} steps complete ·{" "}
            <Link
              href={`/locations/${id}`}
              className="text-blue-600 hover:underline"
            >
              Back to property
            </Link>
          </>
        }
      />

      <Card className="mb-6 border-blue-200 dark:border-blue-900">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          <strong>Already-live property?</strong> Run the{" "}
          <Link href={`/locations/${id}`} className="text-blue-600 hover:underline">
            audit
          </Link>{" "}
          first to assess what exists, then use{" "}
          <em>&ldquo;Already done&rdquo;</em> on each step that&apos;s in place —
          only the gaps become tasks.
        </p>
      </Card>

      <div className="space-y-8">
        {playbook.phases.map((phase) => {
          const phaseDone = phase.steps.filter(
            (s) =>
              stepStatusFromTask(
                latestByKey.get(stepStableKey(s.key))?.status,
              ) === "done",
          ).length;
          const pct = Math.round((phaseDone / phase.steps.length) * 100);
          return (
            <section key={phase.key} id={phase.key}>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">{phase.title}</h2>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">
                    {phaseDone}/{phase.steps.length}
                  </span>
                  {phaseDone < phase.steps.length && (
                    <form action={startPhase.bind(null, id, phase.key)}>
                      <Button type="submit" variant="secondary">
                        Start remaining steps
                      </Button>
                    </form>
                  )}
                </div>
              </div>
              <p className="mb-2 text-sm text-gray-500">{phase.description}</p>
              <div className="mb-3 h-1.5 w-full overflow-hidden rounded bg-gray-200 dark:bg-gray-800">
                <div
                  className="h-full bg-blue-600"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="space-y-2">
                {phase.steps.map((step) => {
                  const task = latestByKey.get(stepStableKey(step.key));
                  const status = stepStatusFromTask(task?.status);
                  return (
                    <Card key={step.key}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`font-medium ${status === "done" ? "text-gray-400 line-through dark:text-gray-600" : ""}`}
                            >
                              {step.title}
                            </span>
                            {status === "done" && (
                              <Badge color="green">done</Badge>
                            )}
                            {status === "in_progress" && task && (
                              <Badge color={statusBadgeColor(task.status)}>
                                {task.status.replace("_", " ")}
                              </Badge>
                            )}
                          </div>
                          <p className="mt-1 text-sm text-gray-500">
                            {step.goal}
                          </p>
                          {status !== "done" && (
                            <details className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                              <summary className="cursor-pointer select-none text-blue-600">
                                Step-by-step instructions
                              </summary>
                              <p className="mt-2 whitespace-pre-wrap">
                                {step.instructions}
                              </p>
                              <p className="mt-2">
                                <strong>Done when:</strong> {step.done_when}
                              </p>
                            </details>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          {status === "not_started" && (
                            <>
                              <form
                                action={startPlaybookStep.bind(
                                  null,
                                  id,
                                  step.key,
                                )}
                              >
                                <Button type="submit">Start task</Button>
                              </form>
                              <form
                                action={markStepAlreadyDone.bind(
                                  null,
                                  id,
                                  step.key,
                                )}
                              >
                                <button
                                  type="submit"
                                  className="text-xs text-gray-500 hover:text-gray-900 hover:underline dark:hover:text-gray-100"
                                >
                                  Already done ✓
                                </button>
                              </form>
                            </>
                          )}
                          {status === "in_progress" && task && (
                            <>
                              <Link
                                href={`/tasks/${task.id}`}
                                className="text-sm font-medium text-blue-600 hover:underline"
                              >
                                Open task →
                              </Link>
                              <form
                                action={markStepAlreadyDone.bind(
                                  null,
                                  id,
                                  step.key,
                                )}
                              >
                                <button
                                  type="submit"
                                  className="text-xs text-gray-500 hover:text-gray-900 hover:underline dark:hover:text-gray-100"
                                >
                                  Mark done ✓
                                </button>
                              </form>
                            </>
                          )}
                          {status === "done" && task && (
                            <Link
                              href={`/tasks/${task.id}`}
                              className="text-xs text-gray-400 hover:underline"
                            >
                              view record
                            </Link>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
