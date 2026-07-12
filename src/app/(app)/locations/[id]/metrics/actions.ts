"use server";

import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { requireSession } from "@/lib/session";

function num(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function addMetricSnapshot(
  locationId: string,
  formData: FormData,
) {
  const session = await requireSession();
  const db = await getDb();

  const month = String(formData.get("month") ?? ""); // YYYY-MM
  if (!/^\d{4}-\d{2}$/.test(month)) return;
  const [y, m] = month.split("-").map(Number);
  const periodStart = `${month}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const periodEnd = `${month}-${String(lastDay).padStart(2, "0")}`;

  const source = String(formData.get("source") ?? "manual");
  const values = {
    locationId,
    periodStart,
    periodEnd,
    source,
    calls: num(formData.get("calls")),
    websiteClicks: num(formData.get("websiteClicks")),
    directions: num(formData.get("directions")),
    bookings: num(formData.get("bookings")),
    reviewCount: num(formData.get("reviewCount")),
    rating: num(formData.get("rating")),
    leads: num(formData.get("leads")),
    qualifiedLeads: num(formData.get("qualifiedLeads")),
    revenueEstimate: num(formData.get("revenueEstimate")),
    notes: String(formData.get("notes") ?? "").trim() || null,
    createdBy: session.user.id,
  };

  // Same location+period+source updates in place (correcting an entry);
  // a different source never overwrites another source's row.
  await db
    .insert(schema.metricSnapshots)
    .values(values)
    .onConflictDoUpdate({
      target: [
        schema.metricSnapshots.locationId,
        schema.metricSnapshots.periodStart,
        schema.metricSnapshots.periodEnd,
        schema.metricSnapshots.source,
      ],
      set: values,
    });

  revalidatePath(`/locations/${locationId}/metrics`);
}
