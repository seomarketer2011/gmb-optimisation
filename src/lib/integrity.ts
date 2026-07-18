/**
 * Listing protection: compare a property's confirmed baseline (the data we
 * know is correct) against what Google currently shows, so a "suggested
 * edit" that slips through gets caught instead of silently going live.
 *
 * Comparison is format-tolerant — punctuation, spacing, case and phone
 * formatting differences are NOT drift; only a real value change is.
 */

import type { GbpLookupResult } from "./places";

/**
 * Risk level per GBP field. Single source of truth shared with the change
 * log (changes/actions.ts), so protection restore-tasks and change-approval
 * rules never disagree about how dangerous a field is.
 */
export const GBP_FIELD_RISK: Record<
  string,
  { risk: string; approval: boolean }
> = {
  business_name: { risk: "high", approval: true },
  primary_category: { risk: "high", approval: true },
  address: { risk: "high", approval: true },
  map_pin: { risk: "high", approval: true },
  business_status: { risk: "high", approval: true },
  phone: { risk: "medium", approval: true },
  website: { risk: "medium", approval: true },
  service_areas: { risk: "medium", approval: true },
  hours: { risk: "low", approval: false },
  description: { risk: "low", approval: false },
  other: { risk: "low", approval: false },
};

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

/** The live-listing fields a check compares and snapshots. */
export type LiveValues = Pick<
  GbpLookupResult,
  | "name"
  | "address"
  | "phone"
  | "primaryCategory"
  | "hours"
  | "businessStatus"
  | "latitude"
  | "longitude"
>;

export function snapshotOf(live: LiveValues): LiveValues {
  return {
    name: live.name,
    address: live.address,
    phone: live.phone,
    primaryCategory: live.primaryCategory,
    hours: live.hours,
    businessStatus: live.businessStatus,
    latitude: live.latitude,
    longitude: live.longitude,
  };
}

export type FieldDiff = {
  field: string;
  label: string;
  risk: string;
  expected: string;
  live: string;
  changed: boolean;
};

// A pin moved further than this (metres) is treated as tampering, not the
// small rounding jitter Google returns for the same location.
export const MAP_PIN_TOLERANCE_M = 50;

// ---------------------------------------------------------------------------
// Normalisers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Protected-field registry — the ONE table that drives the drift comparison.
// To protect a new field, add an entry here (plus its baseline storage).
// ---------------------------------------------------------------------------

type FieldDef = {
  key: string;
  label: string;
  /** false = baseline never captured this field, skip it */
  isProtected: (b: BaselineValues) => boolean;
  expected: (b: BaselineValues) => string;
  live: (l: LiveValues) => string;
  /**
   * Only called when the field is protected. Must return false when the live
   * value is absent from the response — "Google omitted an optional field"
   * is not drift.
   */
  changed: (b: BaselineValues, l: LiveValues) => boolean;
};

export const PROTECTED_FIELDS: FieldDef[] = [
  {
    key: "business_name",
    label: "Business name",
    isProtected: (b) => !!b.businessName,
    expected: (b) => b.businessName,
    live: (l) => l.name,
    changed: (b, l) => !!l.name && normLoose(b.businessName) !== normLoose(l.name),
  },
  {
    key: "address",
    label: "Address",
    isProtected: (b) => !!b.address,
    expected: (b) => b.address ?? "",
    live: (l) => l.address ?? "",
    changed: (b, l) => normLoose(b.address) !== normLoose(l.address),
  },
  {
    key: "phone",
    label: "Phone number",
    isProtected: (b) => !!b.phone,
    expected: (b) => b.phone ?? "",
    live: (l) => l.phone ?? "",
    changed: (b, l) => normPhone(b.phone) !== normPhone(l.phone),
  },
  {
    key: "primary_category",
    label: "Primary category",
    isProtected: (b) => !!b.primaryCategory,
    expected: (b) => b.primaryCategory ?? "",
    live: (l) => l.primaryCategory ?? "",
    changed: (b, l) => normText(b.primaryCategory) !== normText(l.primaryCategory),
  },
  {
    key: "hours",
    label: "Opening hours",
    isProtected: (b) => b.hours.length > 0,
    expected: (b) => hoursToText(b.hours),
    live: (l) => hoursToText(l.hours),
    changed: (b, l) => normHours(b.hours) !== normHours(l.hours),
  },
  {
    key: "business_status",
    label: "Open/closed status",
    isProtected: (b) => !!b.businessStatus,
    expected: (b) => businessStatusLabel(b.businessStatus),
    live: (l) => businessStatusLabel(l.businessStatus),
    changed: (b, l) =>
      l.businessStatus != null &&
      (b.businessStatus ?? "").toUpperCase() !==
        l.businessStatus.toUpperCase(),
  },
  {
    key: "map_pin",
    label: "Map pin location",
    isProtected: (b) => b.latitude != null && b.longitude != null,
    expected: (b) => formatPin(b.latitude, b.longitude),
    live: (l) => formatPin(l.latitude, l.longitude),
    changed: (b, l) =>
      l.latitude != null &&
      l.longitude != null &&
      haversineMetres(b.latitude!, b.longitude!, l.latitude, l.longitude) >
        MAP_PIN_TOLERANCE_M,
  },
];

export function fieldLabel(key: string): string {
  return PROTECTED_FIELDS.find((f) => f.key === key)?.label ?? key;
}

export function fieldRisk(key: string): string {
  return GBP_FIELD_RISK[key]?.risk ?? "low";
}

/**
 * Compare confirmed baseline vs live listing. Fields the baseline never
 * captured are skipped (business name is always required, so always checked).
 */
export function diffBaseline(
  baseline: BaselineValues,
  live: LiveValues,
): FieldDiff[] {
  return PROTECTED_FIELDS.filter((f) => f.isProtected(baseline)).map((f) => ({
    field: f.key,
    label: f.label,
    risk: fieldRisk(f.key),
    expected: f.expected(baseline).trim() || "—",
    live: f.live(live).trim() || "—",
    changed: f.changed(baseline, live),
  }));
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

/** Display treatment for an integrity-check status, shared by both pages. */
export const CHECK_STATUS: Record<
  string,
  { label: string; color: "green" | "red" | "yellow" }
> = {
  ok: { label: "all correct", color: "green" },
  drift: { label: "data changed", color: "red" },
  error: { label: "error", color: "yellow" },
};

export function checkStatusDisplay(status: string) {
  return CHECK_STATUS[status] ?? { label: status, color: "yellow" as const };
}
