"use server";

import { revalidatePath } from "next/cache";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb, schema } from "@/db";
import { requireSession } from "@/lib/session";
import { lookupGbpFromUrl, type GbpLookupResult } from "@/lib/places";

export type LookupResponse =
  | { ok: true; data: GbpLookupResult }
  | { ok: false; error: string };

export async function lookupGbp(url: string): Promise<LookupResponse> {
  await requireSession();
  if (!url?.trim()) return { ok: false, error: "Paste a Maps or share URL." };

  const { env } = await getCloudflareContext({ async: true });
  const apiKey = env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error:
        "Google Maps API key is not configured yet. Add the GOOGLE_MAPS_API_KEY secret (see README) and this will light up.",
    };
  }
  return lookupGbpFromUrl(url, apiKey);
}

export async function importGbpProperty(
  data: GbpLookupResult,
  clientId: string,
): Promise<{ ok: true; locationId: string } | { ok: false; error: string }> {
  const session = await requireSession();
  if (!clientId) return { ok: false, error: "Pick a niche first." };
  const db = await getDb();

  const [loc] = await db
    .insert(schema.locations)
    .values({
      clientId,
      name: data.name,
      address: data.address,
      city: data.city,
      postcode: data.postcode,
      phone: data.phone,
      website: data.website,
      gbpUrl: data.gbpUrl,
      placeId: data.placeId,
      primaryCategory: data.primaryCategory,
      status: "active",
      notes: [
        `Imported from Google Maps (place ID: ${data.placeId}).`,
        data.hours.length ? `Hours:\n${data.hours.join("\n")}` : null,
        data.types.length ? `Google types: ${data.types.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join("\n\n"),
    })
    .returning({ id: schema.locations.id });

  // Baseline metrics from the live profile
  if (data.rating !== null || data.reviewCount !== null) {
    const now = new Date();
    const month = now.toISOString().slice(0, 7);
    const lastDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
    ).getUTCDate();
    await db
      .insert(schema.metricSnapshots)
      .values({
        locationId: loc.id,
        periodStart: `${month}-01`,
        periodEnd: `${month}-${String(lastDay).padStart(2, "0")}`,
        source: "gbp_api",
        reviewCount: data.reviewCount,
        rating: data.rating,
        notes: "Baseline captured at import from Google Maps.",
        createdBy: session.user.id,
      })
      .onConflictDoNothing();
  }

  revalidatePath("/locations");
  revalidatePath("/gbp");
  return { ok: true, locationId: loc.id };
}
