import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireSession } from "@/lib/session";
import {
  Card,
  Input,
  Label,
  PageHeader,
  Select,
  Textarea,
  Button,
} from "@/components/ui";
import { createTask } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<{ locationId?: string; templateId?: string }>;
}) {
  await requireSession();
  const { locationId, templateId } = await searchParams;
  const db = await getDb();

  const locations = await db
    .select({
      id: schema.locations.id,
      name: schema.locations.name,
      clientName: schema.clients.name,
    })
    .from(schema.locations)
    .innerJoin(schema.clients, eq(schema.locations.clientId, schema.clients.id))
    .orderBy(asc(schema.clients.name), asc(schema.locations.name));

  const templates = await db
    .select()
    .from(schema.taskTemplates)
    .where(eq(schema.taskTemplates.isActive, true))
    .orderBy(asc(schema.taskTemplates.title));

  const users = await db
    .select({ id: schema.user.id, name: schema.user.name })
    .from(schema.user)
    .orderBy(asc(schema.user.name));

  return (
    <div>
      <PageHeader
        title="New task"
        subtitle="Pick a template for prefilled VA instructions, or write a one-off task"
      />
      <Card className="max-w-2xl">
        <form action={createTask} className="space-y-3">
          <div>
            <Label htmlFor="locationId">Location *</Label>
            <Select
              id="locationId"
              name="locationId"
              required
              defaultValue={locationId ?? ""}
            >
              <option value="" disabled>
                Select a location…
              </option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.clientName} — {l.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="templateId">Template (optional)</Label>
            <Select
              id="templateId"
              name="templateId"
              defaultValue={templateId ?? ""}
            >
              <option value="">No template — one-off task</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                  {t.recurrenceDays ? ` (recurs every ${t.recurrenceDays}d)` : ""}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-gray-500">
              Template tasks come with step-by-step instructions, definition of
              done, priority, risk level and recurrence built in.
            </p>
          </div>
          <div>
            <Label htmlFor="title">Title (leave blank to use template title)</Label>
            <Input id="title" name="title" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="priority">Priority</Label>
              <Select id="priority" name="priority" defaultValue="">
                <option value="">Template default / P2</option>
                <option value="p1">P1 — urgent</option>
                <option value="p2">P2 — normal</option>
                <option value="p3">P3 — low</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="dueDate">Due date</Label>
              <Input id="dueDate" name="dueDate" type="date" />
            </div>
          </div>
          <div>
            <Label htmlFor="ownerId">Owner</Label>
            <Select id="ownerId" name="ownerId" defaultValue="">
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="instructions">
              Instructions (leave blank to use template instructions)
            </Label>
            <Textarea id="instructions" name="instructions" rows={4} />
          </div>
          <Button type="submit">Create task</Button>
        </form>
      </Card>
    </div>
  );
}
