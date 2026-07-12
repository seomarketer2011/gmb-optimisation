"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireRole } from "@/lib/session";

export async function createClient(formData: FormData) {
  await requireRole("admin", "operator");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const db = await getDb();
  await db.insert(schema.clients).values({
    name,
    notes: String(formData.get("notes") ?? "").trim() || null,
  });
  revalidatePath("/clients");
}

export async function updateClientStatus(clientId: string, status: string) {
  await requireRole("admin", "operator");
  if (!["active", "paused", "archived"].includes(status)) return;
  const db = await getDb();
  await db
    .update(schema.clients)
    .set({ status })
    .where(eq(schema.clients.id, clientId));
  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
}
