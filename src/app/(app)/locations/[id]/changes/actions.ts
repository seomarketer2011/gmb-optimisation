"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { GBP_FIELD_RISK } from "@/lib/integrity";
import { requireSession } from "@/lib/session";

// Sensitive fields always require approval; a wrong edit here can trigger
// suspension or tank rankings. Shared with the protection feature so both
// grade fields identically.
const FIELD_RISK = GBP_FIELD_RISK;

export async function proposeChange(locationId: string, formData: FormData) {
  const session = await requireSession();
  const db = await getDb();

  const field = String(formData.get("field") ?? "");
  const proposedValue = String(formData.get("proposedValue") ?? "").trim();
  if (!FIELD_RISK[field] || !proposedValue) return;

  const meta = FIELD_RISK[field];
  await db.insert(schema.changes).values({
    locationId,
    field,
    previousValue: String(formData.get("previousValue") ?? "").trim() || null,
    proposedValue,
    status: "proposed",
    riskLevel: meta.risk,
    approvalRequired: meta.approval,
    proposedBy: session.user.id,
    notes: String(formData.get("notes") ?? "").trim() || null,
  });
  revalidatePath(`/locations/${locationId}/changes`);
}

export async function setChangeStatus(changeId: string, status: string) {
  const session = await requireSession();
  const role = (session.user as { role?: string }).role ?? "va";
  const db = await getDb();

  const change = await db.query.changes.findFirst({
    where: eq(schema.changes.id, changeId),
  });
  if (!change) return;

  const now = new Date();
  const uid = session.user.id;

  switch (status) {
    case "approved": {
      if (role !== "admin" && role !== "operator") return;
      if (change.status !== "proposed") return;
      await db
        .update(schema.changes)
        .set({ status, approvedBy: uid, approvedAt: now })
        .where(eq(schema.changes.id, changeId));
      break;
    }
    case "submitted": {
      // The VA applies the edit on the profile, then records submission.
      const okFrom =
        change.status === "approved" ||
        (change.status === "proposed" && !change.approvalRequired);
      if (!okFrom) return;
      await db
        .update(schema.changes)
        .set({ status, submittedBy: uid, submittedAt: now })
        .where(eq(schema.changes.id, changeId));
      break;
    }
    case "accepted":
    case "rejected": {
      // Verified against what Google actually shows.
      if (change.status !== "submitted") return;
      await db
        .update(schema.changes)
        .set({ status, verifiedBy: uid, verifiedAt: now })
        .where(eq(schema.changes.id, changeId));
      break;
    }
    case "reverted":
    case "superseded": {
      if (role !== "admin" && role !== "operator") return;
      await db
        .update(schema.changes)
        .set({ status, verifiedBy: uid, verifiedAt: now })
        .where(eq(schema.changes.id, changeId));
      break;
    }
    default:
      return;
  }
  revalidatePath(`/locations/${change.locationId}/changes`);
}
