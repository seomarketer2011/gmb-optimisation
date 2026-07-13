import Link from "next/link";
import { asc, eq, inArray, like, and } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireSession } from "@/lib/session";
import {
  GBP_PHASE_KEY,
  GBP_TASK_TYPES,
  playbook,
  stepStableKey,
  stepStatusFromTask,
} from "@/lib/playbook";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  statusBadgeColor,
} from "@/components/ui";

export const dynamic = "force-dynamic";

const OPEN_STATUSES = ["backlog", "todo", "in_progress", "waiting", "blocked"];

export default async function GbpHubPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  await requireSession();
  const { view } = await searchParams;
  const showTasks = view === "tasks";
  const db = await getDb();

  const gbpPhase = playbook.phases.find((p) => p.key === GBP_PHASE_KEY)!;
  const gbpStepKeys = gbpPhase.steps.map((s) => stepStableKey(s.key));

  const locations = await db
    .select({
      location: schema.locations,
      nicheName: schema.clients.name,
    })
    .from(schema.locations)
    .innerJoin(schema.clients, eq(schema.locations.clientId, schema.clients.id))
    .where(inArray(schema.locations.status, ["active", "onboarding"]))
    .orderBy(asc(schema.clients.name), asc(schema.locations.name));

  // GBP setup progress per property (latest task per phase-3 step)
  const stepTasks = await db
    .select({
      locationId: schema.tasks.locationId,
      sourceStableKey: schema.tasks.sourceStableKey,
      status: schema.tasks.status,
      createdAt: schema.tasks.createdAt,
    })
    .from(schema.tasks)
    .where(like(schema.tasks.sourceStableKey, `pb:${playbook.key}:p3.%`));

  const progress = new Map<string, { done: number }>();
  const latest = new Map<string, { status: string; createdAt: Date }>();
  for (const t of stepTasks) {
    const k = `${t.locationId}|${t.sourceStableKey}`;
    const prev = latest.get(k);
    if (!prev || t.createdAt > prev.createdAt) {
      latest.set(k, { status: t.status, createdAt: t.createdAt });
    }
  }
  for (const { location } of locations) {
    let done = 0;
    for (const sk of gbpStepKeys) {
      const entry = latest.get(`${location.id}|${sk}`);
      if (stepStatusFromTask(entry?.status) === "done") done++;
    }
    progress.set(location.id, { done });
  }

  // GBP-only open tasks
  const gbpTasks = showTasks
    ? await db
        .select({
          task: schema.tasks,
          locationName: schema.locations.name,
        })
        .from(schema.tasks)
        .innerJoin(
          schema.locations,
          eq(schema.tasks.locationId, schema.locations.id),
        )
        .where(
          and(
            inArray(schema.tasks.status, OPEN_STATUSES),
            inArray(schema.tasks.taskType, GBP_TASK_TYPES),
          ),
        )
        .orderBy(asc(schema.tasks.dueDate))
    : [];

  const now = new Date();
  const tab = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      className={`rounded-md px-3 py-1.5 text-sm ${
        active
          ? "bg-blue-600 text-white"
          : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div>
      <PageHeader
        title="GBP"
        subtitle="Everything Google Business Profile: setup progress per property, and the ongoing GBP work queue"
      />
      <div className="mb-4 flex gap-2">
        {tab("/gbp", "Optimisation progress", !showTasks)}
        {tab("/gbp?view=tasks", "GBP tasks", showTasks)}
      </div>

      {!showTasks ? (
        locations.length === 0 ? (
          <EmptyState
            title="No properties yet"
            hint="Add a property, then work through its GBP optimisation phase."
          />
        ) : (
          <Card className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500 dark:border-gray-700">
                  <th className="px-4 py-3 font-medium">Property</th>
                  <th className="px-4 py-3 font-medium">Niche</th>
                  <th className="px-4 py-3 font-medium">GBP setup</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {locations.map(({ location, nicheName }) => {
                  const p = progress.get(location.id)!;
                  const pct = Math.round((p.done / gbpStepKeys.length) * 100);
                  return (
                    <tr
                      key={location.id}
                      className="border-b border-gray-100 last:border-0 dark:border-gray-800"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/locations/${location.id}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {location.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{nicheName}</td>
                      <td className="w-1/3 px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-full overflow-hidden rounded bg-gray-200 dark:bg-gray-800">
                            <div
                              className={`h-full ${pct === 100 ? "bg-green-600" : "bg-blue-600"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="whitespace-nowrap text-xs text-gray-500">
                            {p.done}/{gbpStepKeys.length}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/locations/${location.id}/playbook#p3`}
                          className="text-sm font-medium text-blue-600 hover:underline"
                        >
                          {pct === 100 ? "Review" : "Continue setup"} →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )
      ) : gbpTasks.length === 0 ? (
        <EmptyState
          title="No open GBP tasks"
          hint='Open a property and click "Set up standard ops plan" to start the weekly GBP cycle.'
        />
      ) : (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500 dark:border-gray-700">
                <th className="px-4 py-3 font-medium">Task</th>
                <th className="px-4 py-3 font-medium">Property</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Due</th>
              </tr>
            </thead>
            <tbody>
              {gbpTasks.map(({ task, locationName }) => {
                const overdue = task.dueDate && task.dueDate < now;
                return (
                  <tr
                    key={task.id}
                    className="border-b border-gray-100 last:border-0 dark:border-gray-800"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/tasks/${task.id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {task.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{locationName}</td>
                    <td className="px-4 py-3">
                      {task.taskType.replace("_", " ")}
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={statusBadgeColor(task.status)}>
                        {task.status.replace("_", " ")}
                      </Badge>
                    </td>
                    <td
                      className={`px-4 py-3 ${overdue ? "font-medium text-red-600" : ""}`}
                    >
                      {task.dueDate
                        ? task.dueDate.toISOString().slice(0, 10)
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
