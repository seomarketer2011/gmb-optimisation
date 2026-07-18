"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { str } from "@/lib/form";
import { requireRole, requireSession } from "@/lib/session";

function revalidateContent(id: string, locationId?: string) {
  revalidatePath("/content");
  revalidatePath(`/content/${id}`);
  if (locationId) revalidatePath(`/locations/${locationId}`);
}

export async function createContent(formData: FormData) {
  const session = await requireRole("admin", "operator", "va");
  const db = await getDb();

  const locationId = str(formData.get("locationId"));
  const body = str(formData.get("body"));
  const contentType = str(formData.get("contentType"));
  if (!locationId || !body || !contentType) return;

  const scheduledRaw = str(formData.get("scheduledFor"));

  const [item] = await db
    .insert(schema.contentItems)
    .values({
      locationId,
      taskId: str(formData.get("taskId")),
      contentType,
      title: str(formData.get("title")),
      body,
      cta: str(formData.get("cta")),
      ctaUrl: str(formData.get("ctaUrl")),
      mediaBrief: str(formData.get("mediaBrief")),
      status: str(formData.get("status")) ?? "draft",
      scheduledFor: scheduledRaw ? new Date(scheduledRaw) : null,
      createdBy: session.user.id,
    })
    .returning({ id: schema.contentItems.id });

  revalidateContent(item.id, locationId);
  redirect(`/content/${item.id}`);
}

export async function updateContent(contentId: string, formData: FormData) {
  await requireRole("admin", "operator", "va");
  const db = await getDb();
  const existing = await db.query.contentItems.findFirst({
    where: eq(schema.contentItems.id, contentId),
  });
  if (!existing) return;

  const scheduledRaw = str(formData.get("scheduledFor"));
  await db
    .update(schema.contentItems)
    .set({
      title: str(formData.get("title")),
      body: str(formData.get("body")) ?? existing.body,
      cta: str(formData.get("cta")),
      ctaUrl: str(formData.get("ctaUrl")),
      mediaBrief: str(formData.get("mediaBrief")),
      scheduledFor: scheduledRaw ? new Date(scheduledRaw) : null,
    })
    .where(eq(schema.contentItems.id, contentId));
  revalidateContent(contentId, existing.locationId);
}

export async function setContentStatus(contentId: string, status: string) {
  const session = await requireSession();
  if (
    !["draft", "ready", "published", "rejected", "expired"].includes(status)
  ) {
    return;
  }
  const db = await getDb();
  const existing = await db.query.contentItems.findFirst({
    where: eq(schema.contentItems.id, contentId),
  });
  if (!existing) return;

  await db
    .update(schema.contentItems)
    .set(
      status === "published"
        ? {
            status,
            publishedAt: new Date(),
            publishedBy: session.user.id,
          }
        : { status },
    )
    .where(eq(schema.contentItems.id, contentId));
  revalidateContent(contentId, existing.locationId);
}
