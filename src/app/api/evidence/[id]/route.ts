import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { getSession } from "@/lib/session";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const db = await getDb();
  const evidence = await db.query.taskEvidence.findFirst({
    where: eq(schema.taskEvidence.id, id),
  });
  if (!evidence?.storageKey) {
    return new Response("Not found", { status: 404 });
  }

  const { env } = await getCloudflareContext({ async: true });
  const object = await env.EVIDENCE.get(evidence.storageKey);
  if (!object) return new Response("File missing from storage", { status: 404 });

  return new Response(object.body, {
    headers: {
      "Content-Type": evidence.mimeType ?? "application/octet-stream",
      "Content-Disposition": `inline; filename="${(evidence.originalFilename ?? "file").replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
