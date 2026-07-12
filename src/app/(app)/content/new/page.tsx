import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireSession } from "@/lib/session";
import {
  Button,
  Card,
  Input,
  Label,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";
import { createContent } from "../actions";

export const dynamic = "force-dynamic";

const CONTENT_TYPES = [
  { value: "post", label: "GBP post" },
  { value: "offer", label: "Offer" },
  { value: "event", label: "Event" },
  { value: "review_reply", label: "Review reply" },
  { value: "qa", label: "Q&A pair" },
  { value: "description", label: "Business description" },
  { value: "service", label: "Service description" },
  { value: "photo_brief", label: "Photo brief" },
];

export default async function NewContentPage({
  searchParams,
}: {
  searchParams: Promise<{ locationId?: string; taskId?: string }>;
}) {
  await requireSession();
  const { locationId, taskId } = await searchParams;
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

  return (
    <div>
      <PageHeader
        title="Prepare content"
        subtitle="Write it once here so the VA can copy-paste it exactly"
      />
      <Card className="max-w-2xl">
        <form action={createContent} className="space-y-3">
          {taskId && <input type="hidden" name="taskId" value={taskId} />}
          <div className="grid grid-cols-2 gap-3">
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
              <Label htmlFor="contentType">Type *</Label>
              <Select id="contentType" name="contentType" required>
                {CONTENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="title">Internal title</Label>
            <Input
              id="title"
              name="title"
              placeholder="e.g. July fire door inspection post"
            />
          </div>
          <div>
            <Label htmlFor="body">Content text * (exactly as it will be pasted)</Label>
            <Textarea id="body" name="body" rows={7} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cta">CTA button label</Label>
              <Input id="cta" name="cta" placeholder="e.g. Call now" />
            </div>
            <div>
              <Label htmlFor="ctaUrl">CTA URL (with UTMs)</Label>
              <Input id="ctaUrl" name="ctaUrl" placeholder="https://…?utm_source=google&utm_medium=organic&utm_campaign=gbp" />
            </div>
          </div>
          <div>
            <Label htmlFor="mediaBrief">Media brief (what image/video to attach)</Label>
            <Textarea id="mediaBrief" name="mediaBrief" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="scheduledFor">Publish date</Label>
              <Input id="scheduledFor" name="scheduledFor" type="date" />
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select id="status" name="status" defaultValue="draft">
                <option value="draft">Draft</option>
                <option value="ready">Ready to publish</option>
              </Select>
            </div>
          </div>
          <Button type="submit">Save content</Button>
        </form>
      </Card>
    </div>
  );
}
