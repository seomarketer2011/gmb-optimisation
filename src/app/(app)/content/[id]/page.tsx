import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
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
import { setContentStatus, updateContent } from "../actions";

export const dynamic = "force-dynamic";

export default async function ContentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const db = await getDb();

  const item = await db.query.contentItems.findFirst({
    where: eq(schema.contentItems.id, id),
  });
  if (!item) notFound();

  const location = await db.query.locations.findFirst({
    where: eq(schema.locations.id, item.locationId),
  });

  const update = updateContent.bind(null, item.id);
  const statusForm = (status: string, label: string, primary = false) => {
    const action = setContentStatus.bind(null, item.id, status);
    return (
      <form action={action}>
        <Button type="submit" variant={primary ? "primary" : "secondary"}>
          {label}
        </Button>
      </form>
    );
  };

  return (
    <div>
      <PageHeader
        title={item.title ?? `${item.contentType.replace("_", " ")} content`}
        subtitle={
          location ? (
            <>
              <Link
                href={`/locations/${location.id}`}
                className="text-blue-600 hover:underline"
              >
                {location.name}
              </Link>
              {item.taskId && (
                <>
                  {" · "}
                  <Link
                    href={`/tasks/${item.taskId}`}
                    className="text-blue-600 hover:underline"
                  >
                    linked task
                  </Link>
                </>
              )}
            </>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge color={statusBadgeColor(item.status)}>{item.status}</Badge>
        <Badge color="gray">{item.contentType.replace("_", " ")}</Badge>
        {item.scheduledFor && (
          <span className="text-sm text-gray-500">
            Scheduled {item.scheduledFor.toISOString().slice(0, 10)}
          </span>
        )}
        {item.publishedAt && (
          <span className="text-sm text-green-700 dark:text-green-400">
            Published {item.publishedAt.toISOString().slice(0, 10)}
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-medium">Copy-paste block</h2>
              <div className="flex gap-2">
                <CopyButton text={item.body} label="Copy text" />
                {item.ctaUrl && (
                  <CopyButton text={item.ctaUrl} label="Copy CTA URL" />
                )}
              </div>
            </div>
            <p className="whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-sm text-gray-800 dark:bg-gray-800 dark:text-gray-200">
              {item.body}
            </p>
            {item.cta && (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                CTA button: <strong>{item.cta}</strong>
                {item.ctaUrl && <> → {item.ctaUrl}</>}
              </p>
            )}
            {item.mediaBrief && (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                <strong>Media:</strong> {item.mediaBrief}
              </p>
            )}
          </Card>

          <Card>
            <h2 className="mb-3 font-medium">Edit</h2>
            <form action={update} className="space-y-3">
              <div>
                <Label htmlFor="title">Internal title</Label>
                <Input id="title" name="title" defaultValue={item.title ?? ""} />
              </div>
              <div>
                <Label htmlFor="body">Content text</Label>
                <Textarea
                  id="body"
                  name="body"
                  rows={7}
                  defaultValue={item.body}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="cta">CTA label</Label>
                  <Input id="cta" name="cta" defaultValue={item.cta ?? ""} />
                </div>
                <div>
                  <Label htmlFor="ctaUrl">CTA URL</Label>
                  <Input
                    id="ctaUrl"
                    name="ctaUrl"
                    defaultValue={item.ctaUrl ?? ""}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="mediaBrief">Media brief</Label>
                <Textarea
                  id="mediaBrief"
                  name="mediaBrief"
                  rows={2}
                  defaultValue={item.mediaBrief ?? ""}
                />
              </div>
              <div>
                <Label htmlFor="scheduledFor">Publish date</Label>
                <Input
                  id="scheduledFor"
                  name="scheduledFor"
                  type="date"
                  defaultValue={
                    item.scheduledFor
                      ? item.scheduledFor.toISOString().slice(0, 10)
                      : ""
                  }
                />
              </div>
              <Button type="submit" variant="secondary">
                Save changes
              </Button>
            </form>
          </Card>
        </div>

        <div>
          <Card>
            <h2 className="mb-3 font-medium">Workflow</h2>
            <div className="flex flex-wrap gap-2">
              {item.status === "draft" && statusForm("ready", "Mark ready", true)}
              {item.status === "ready" &&
                statusForm("published", "Mark published", true)}
              {item.status === "ready" && statusForm("draft", "Back to draft")}
              {item.status !== "rejected" &&
                item.status !== "published" &&
                statusForm("rejected", "Reject")}
              {item.status === "published" &&
                statusForm("expired", "Mark expired")}
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Draft → Ready (approved for posting) → Published (live on the
              profile). The VA only publishes items marked Ready.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
