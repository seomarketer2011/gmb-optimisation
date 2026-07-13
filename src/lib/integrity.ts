/**
 * Listing protection: compare a property's confirmed baseline (the data we
 * know is correct) against what Google currently shows, so a "suggested
 * edit" that slips through gets caught instead of silently going live.
 *
 * Comparison is format-tolerant — punctuation, spacing, case and phone
 * formatting differences are NOT drift; only a real value change is.
 */

import type { GbpLookupResult } from "./places";

export const PROTECTED_FIELDS = [
  { key: "business_name", label: "Business name", risk: "high" },
  { key: "address", label: "Address", risk: "high" },
  { key: "phone", label: "Phone number", risk: "medium" },
  { key: "primary_category", label: "Primary category", risk: "high" },
  { key: "hours", label: "Opening hours", risk: "low" },
  { key: "business_status", label: "Open/closed status", risk: "high" },
  { key: "map_pin", label: "Map pin location", risk: "high" },
] as const;

export type ProtectedFieldKey = (typeof PROTECTED_FIELDS)[number]["key"];

// A pin moved further than this (metres) is treated as tampering, not the
// small rounding jitter Google returns for the same location.
export const MAP_PIN_TOLERANCE_M = 50;

export type BaselineValues = {
  businessName: string;
  address: string | null;
  phone: string | null;
  primaryCategory: string | null;
  hours: string[]; // weekday descriptions, Monday first
  businessStatus: string | null; // OPERATIONAL | CLOSED_TEMPORARILY | CLOSED_PERMANENTLY
  latitude: number | null;
  longitude: number | null;
};

/** Human-readable label for a Google businessStatus enum value. */
export function businessStatusLabel(status: string | null): string {
  switch ((status ?? "").toUpperCase()) {
    case "OPERATIONAL":
      return "Open";
    case "CLOSED_TEMPORARILY":
      return "Temporarily closed";
    case "CLOSED_PERMANENTLY":
      return "Permanently closed";
    default:
      return status || "—";
  }
}

export function formatPin(lat: number | null, lng: number | null): string {
  if (lat == null || lng == null) return "—";
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

/** Great-circle distance between two lat/lng points, in metres. */
export function haversineMetres(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export type FieldDiff = {
  field: ProtectedFieldKey;
  label: string;
  risk: string;
  expected: string;
  live: string;
  changed: boolean;
};

// Google uses non-breaking / narrow / thin spaces in hours strings
const ANY_SPACE = /[\s\u00a0\u2009\u202f]+/g;
// ...and typographic dashes (figure dash through horizontal bar, minus sign)
const ANY_DASH = /[\u2012-\u2015\u2212]/g;

const collapse = (s: string) => s.replace(ANY_SPACE, " ").trim();

const normText = (v: string | null | undefined) =>
  v ? collapse(v).toLowerCase() : "";

// Also punctuation-insensitive: "Co." vs "Co", "12 High St," vs "12 High St"
const normLoose = (v: string | null | undefined) =>
  normText(v).replace(/[.,]/g, "").replace(/ +/g, " ").trim();

/** Digits only; +44 / 0044 international and 0-prefixed national match. */
const normPhone = (v: string | null | undefined) => {
  let d = (v ?? "").replace(/\D/g, "");
  if (d.startsWith("0044")) d = d.slice(4);
  else if (d.startsWith("44") && d.length > 10) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  return d;
};

const normHours = (hours: string[]) =>
  hours
    .map((h) => h.toLowerCase().replace(ANY_DASH, "-").replace(ANY_SPACE, ""))
    .filter(Boolean)
    .join("\n");

export const hoursToText = (hours: string[]) => hours.join("\n");

/**
 * Compare confirmed baseline vs live listing. Baseline fields left empty are
 * not protected and are skipped (business name is always required).
 */
export function diffBaseline(
  baseline: BaselineValues,
  live: GbpLookupResult,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  const add = (
    field: ProtectedFieldKey,
    expected: string | null,
    liveValue: string | null,
    changed: boolean,
  ) => {
    const def = PROTECTED_FIELDS.find((f) => f.key === field)!;
    diffs.push({
      field,
      label: def.label,
      risk: def.risk,
      expected: expected?.trim() || "—",
      live: liveValue?.trim() || "—",
      changed,
    });
  };

  add(
    "business_name",
    baseline.businessName,
    live.name,
    normLoose(baseline.businessName) !== normLoose(live.name),
  );

  if (baseline.address) {
    add(
      "address",
      baseline.address,
      live.address,
      normLoose(baseline.address) !== normLoose(live.address),
    );
  }

  if (baseline.phone) {
    add(
      "phone",
      baseline.phone,
      live.phone,
      normPhone(baseline.phone) !== normPhone(live.phone),
    );
  }

  if (baseline.primaryCategory) {
    add(
      "primary_category",
      baseline.primaryCategory,
      live.primaryCategory,
      normText(baseline.primaryCategory) !== normText(live.primaryCategory),
    );
  }

  if (baseline.hours.length > 0) {
    add(
      "hours",
      hoursToText(baseline.hours),
      hoursToText(live.hours),
      normHours(baseline.hours) !== normHours(live.hours),
    );
  }

  if (baseline.businessStatus) {
    add(
      "business_status",
      businessStatusLabel(baseline.businessStatus),
      businessStatusLabel(live.businessStatus),
      (baseline.businessStatus ?? "").toUpperCase() !==
        (live.businessStatus ?? "").toUpperCase(),
    );
  }

  if (baseline.latitude != null && baseline.longitude != null) {
    const moved =
      live.latitude == null || live.longitude == null
        ? true
        : haversineMetres(
            baseline.latitude,
            baseline.longitude,
            live.latitude,
            live.longitude,
          ) > MAP_PIN_TOLERANCE_M;
    add(
      "map_pin",
      formatPin(baseline.latitude, baseline.longitude),
      formatPin(live.latitude, live.longitude),
      moved,
    );
  }

  return diffs;
}

export function parseBaselineHours(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
