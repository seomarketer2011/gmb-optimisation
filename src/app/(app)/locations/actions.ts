"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { str } from "@/lib/form";
import { requireRole } from "@/lib/session";

export async function createLocation(formData: FormData) {
  await requireRole("admin", "operator");
  const clientId = str(formData.get("clientId"));
  const name = str(formData.get("name"));
  if (!clientId || !name) return;
  const db = await getDb();
  const [loc] = await db
    .insert(schema.locations)
    .values({
      clientId,
      name,
      address: str(formData.get("address")),
      city: str(formData.get("city")),
      postcode: str(formData.get("postcode")),
      phone: str(formData.get("phone")),
      website: str(formData.get("website")),
      gbpUrl: str(formData.get("gbpUrl")),
      placeId: str(formData.get("placeId")),
      primaryCategory: str(formData.get("primaryCategory")),
      secondaryCategories: str(formData.get("secondaryCategories")),
      serviceAreas: str(formData.get("serviceAreas")),
      services: str(formData.get("services")),
      description: str(formData.get("description")),
      status: str(formData.get("status")) ?? "active",
    })
    .returning({ id: schema.locations.id });
  revalidatePath("/locations");
  revalidatePath(`/clients/${clientId}`);
  redirect(`/locations/${loc.id}`);
}

export async function updateLocation(locationId: string, formData: FormData) {
  await requireRole("admin", "operator");
  const db = await getDb();
  await db
    .update(schema.locations)
    .set({
      name: str(formData.get("name")) ?? undefined,
      address: str(formData.get("address")),
      city: str(formData.get("city")),
      postcode: str(formData.get("postcode")),
      phone: str(formData.get("phone")),
      website: str(formData.get("website")),
      gbpUrl: str(formData.get("gbpUrl")),
      placeId: str(formData.get("placeId")),
      primaryCategory: str(formData.get("primaryCategory")),
      secondaryCategories: str(formData.get("secondaryCategories")),
      serviceAreas: str(formData.get("serviceAreas")),
      services: str(formData.get("services")),
      description: str(formData.get("description")),
      status: str(formData.get("status")) ?? "active",
      notes: str(formData.get("notes")),
    })
    .where(eq(schema.locations.id, locationId));
  revalidatePath("/locations");
  revalidatePath(`/locations/${locationId}`);
}

export type ImportRow = {
  client_name: string;
  location_name: string;
  address?: string;
  city?: string;
  postcode?: string;
  phone?: string;
  website?: string;
  gbp_url?: string;
  primary_category?: string;
  status?: string;
};

export type ImportResult = {
  clientsCreated: number;
  locationsCreated: number;
  skipped: { row: number; reason: string }[];
};

export async function importLocations(
  rows: ImportRow[],
): Promise<ImportResult> {
  await requireRole("admin", "operator");
  const db = await getDb();
  const result: ImportResult = {
    clientsCreated: 0,
    locationsCreated: 0,
    skipped: [],
  };

  // Cache client lookups by lowercase name within this import
  const clientIds = new Map<string, string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const clientName = (row.client_name ?? "").trim();
    const locationName = (row.location_name ?? "").trim();
    if (!clientName || !locationName) {
      result.skipped.push({
        row: i + 1,
        reason: "Missing client_name or location_name",
      });
      continue;
    }

    let clientId = clientIds.get(clientName.toLowerCase());
    if (!clientId) {
      const existing = await db.query.clients.findFirst({
        where: eq(schema.clients.name, clientName),
      });
      if (existing) {
        clientId = existing.id;
      } else {
        const [created] = await db
          .insert(schema.clients)
          .values({ name: clientName })
          .returning({ id: schema.clients.id });
        clientId = created.id;
        result.clientsCreated++;
      }
      clientIds.set(clientName.toLowerCase(), clientId);
    }

    const duplicate = await db.query.locations.findFirst({
      where: and(
        eq(schema.locations.clientId, clientId),
        eq(schema.locations.name, locationName),
      ),
    });
    if (duplicate) {
      result.skipped.push({
        row: i + 1,
        reason: `Location "${locationName}" already exists for this client`,
      });
      continue;
    }

    await db.insert(schema.locations).values({
      clientId,
      name: locationName,
      address: row.address?.trim() || null,
      city: row.city?.trim() || null,
      postcode: row.postcode?.trim() || null,
      phone: row.phone?.trim() || null,
      website: row.website?.trim() || null,
      gbpUrl: row.gbp_url?.trim() || null,
      primaryCategory: row.primary_category?.trim() || null,
      status: row.status?.trim() || "active",
    });
    result.locationsCreated++;
  }

  revalidatePath("/locations");
  revalidatePath("/clients");
  return result;
}
