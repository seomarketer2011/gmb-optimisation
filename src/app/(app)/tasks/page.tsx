import Link from "next/link";
import { asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireSession } from "@/lib/session";
import {
  Badge,
  Card,
  EmptyState,
  LinkButton,
  PageHeader,
  statusBadgeColor,
} from "@/components/ui";

export const dynamic = "force-dynamic";

type Row = {
  task: typeof schema.tasks.$inferSelect;
  locationName: string;
  clientName: string;
  ownerName: string | null;
};

function priorityColor(p: string) {
  return p === "p1" ? "red" : p === "p2" ? "yellow" : "gray";
}

function TaskTable({ rows }: { rows: Row[] }) {
  return (
    <Card className="p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500 dark:border-gray-700">
            <th className="px-4 py-3 font-medium">Task</th>
            <th className="px-4 py-3 font-medium">Location</th>
            <th className="px-4 py-3 font-medium">Priority</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Owner</th>
            <th className="px-4 py-3 font-medium">Due</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ task, locationName, clientName, ownerName }) => (
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
                {task.approvalRequired && !task.approvedBy && (
                  <span className="ml-2">
                    <Badge color="red">needs approval</Badge>
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/locations/${task.locationId}`}
                  className="hover:underline"
                >
                  {locationName}
                </Link>
                <span className="block text-xs text-gray-500">
                  {clientName}
                </span>
              </td>
              <td className="px-4 py-3">
                <Badge
                  color={
                    priorityColor(task.priority) as "red" | "yellow" | "gray"
                  }
                >
                  {task.priority.toUpperCase()}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <Badge color={statusBadgeColor(task.status)}>
                  {task.status.replace("_", " ")}
                </Badge>
              </td>
              <td className="px-4 py-3">{ownerName ?? "—"}</td>
              <td className="px-4 py-3">
                {task.dueDate ? task.dueDate.toISOString().slice(0, 10) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; mine?: string }>;
}) {
  const session = await requireSession();
  const { view, mine } = await searchParams;
  const db = await getDb();

  const showClosed = view === "closed";
  const statuses = showClosed
    ? ["done", "monitoring", "validated", "rejected"]
    : ["backlog", "todo", "in_progress", "waiting", "blocked"];

  let rows: Row[] = await db
    .select({
      task: schema.tasks,
      locationName: schema.locations.name,
      clientName: schema.clients.name,
      ownerName: schema.user.name,
    })
    .from(schema.tasks)
    .innerJoin(
      schema.locations,
      eq(schema.tasks.locationId, schema.locations.id),
    )
    .innerJoin(schema.clients, eq(schema.locations.clientId, schema.clients.id))
    .leftJoin(schema.user, eq(schema.tasks.ownerId, schema.user.id))
    .where(inArray(schema.tasks.status, statuses))
    .orderBy(asc(schema.tasks.dueDate));

  if (mine === "1") {
    rows = rows.filter((r) => r.task.ownerId === session.user.id);
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday.getTime() + 86400000);
  const endOfWeek = new Date(startOfToday.getTime() + 7 * 86400000);

  const overdue = rows.filter(
    (r) => r.task.dueDate && r.task.dueDate < startOfToday,
  );
  const today = rows.filter(
    (r) =>
      r.task.dueDate &&
      r.task.dueDate >= startOfToday &&
      r.task.dueDate < endOfToday,
  );
  const thisWeek = rows.filter(
    (r) =>
      r.task.dueDate &&
      r.task.dueDate >= endOfToday &&
      r.task.dueDate < endOfWeek,
  );
  const later = rows.filter(
    (r) => !r.task.dueDate || r.task.dueDate >= endOfWeek,
  );

  const filterLink = (params: string, label: string, active: boolean) => (
    <Link
      href={`/tasks${params}`}
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
        title="Tasks"
        subtitle="The work queue — everything due, in order"
        actions={<LinkButton href="/tasks/new">New task</LinkButton>}
      />
      <div className="mb-4 flex gap-2">
        {filterLink("", "Open", !showClosed && mine !== "1")}
        {filterLink("?mine=1", "My tasks", !showClosed && mine === "1")}
        {filterLink("?view=closed", "Closed", showClosed)}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={showClosed ? "No closed tasks yet" : "No open tasks"}
          hint={
            showClosed
              ? undefined
              : 'Create a task, or open a location and click "Set up standard ops plan" to seed the recurring VA work cycle.'
          }
        />
      ) : showClosed ? (
        <TaskTable rows={rows} />
      ) : (
        <div className="space-y-6">
          {overdue.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-red-600">
                Overdue ({overdue.length})
              </h2>
              <TaskTable rows={overdue} />
            </section>
          )}
          {today.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold">
                Due today ({today.length})
              </h2>
              <TaskTable rows={today} />
            </section>
          )}
          {thisWeek.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold">
                This week ({thisWeek.length})
              </h2>
              <TaskTable rows={thisWeek} />
            </section>
          )}
          {later.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-gray-500">
                Later / no due date ({later.length})
              </h2>
              <TaskTable rows={later} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
