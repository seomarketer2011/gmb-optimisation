import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSession } from "@/lib/session";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
];

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  const taskId = String(form.get("taskId") ?? "");
  const evidenceType = String(form.get("evidenceType") ?? "file");

  if (!(file instanceof File) || !taskId) {
    return new Response("Missing file or taskId", { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return new Response("File too large (max 10 MB)", { status: 413 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return new Response("Only images and PDFs are allowed", { status: 415 });
  }
  if (!["before", "after", "file"].includes(evidenceType)) {
    return new Response("Invalid evidence type", { status: 400 });
  }

  const db = await getDb();
  const task = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, taskId),
  });
  if (!task) return new Response("Task not found", { status: 404 });

  const safeName = file.name.replace(/[^\w.\-]/g, "_").slice(0, 100);
  const storageKey = `evidence/${taskId}/${crypto.randomUUID()}-${safeName}`;

  const { env } = await getCloudflareContext({ async: true });
  await env.EVIDENCE.put(storageKey, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  const [row] = await db
    .insert(schema.taskEvidence)
    .values({
      taskId,
      evidenceType,
      storageKey,
      originalFilename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      createdBy: session.user.id,
    })
    .returning({ id: schema.taskEvidence.id });

  return Response.json({ id: row.id, storageKey });
}
