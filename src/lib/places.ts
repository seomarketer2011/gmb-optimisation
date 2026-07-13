/**
 * Look up a Google Business Profile's public data from any Maps URL
 * (maps.app.goo.gl share links, full google.com/maps/place URLs, g.page
 * links) using the Places API (New). Requires the GOOGLE_MAPS_API_KEY
 * secret with "Places API (New)" enabled on the key's project.
 */

export type GbpLookupResult = {
  placeId: string;
  name: string;
  address: string | null;
  city: string | null;
  postcode: string | null;
  phone: string | null;
  website: string | null;
  gbpUrl: string;
  primaryCategory: string | null;
  types: string[];
  rating: number | null;
  reviewCount: number | null;
  hours: string[];
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** Follow share-link redirects to the full Maps URL. */
async function resolveMapsUrl(url: string): Promise<string> {
  let current = url;
  for (let i = 0; i < 6; i++) {
    const res = await fetch(current, {
      method: "GET",
      redirect: "manual",
      headers: { "User-Agent": UA },
    });
    const loc = res.headers.get("location");
    if (!loc) return current;
    let next = new URL(loc, current).toString();
    // Google consent interstitial wraps the destination in ?continue=
    const u = new URL(next);
    if (u.hostname.includes("consent.google")) {
      const cont = u.searchParams.get("continue");
      if (cont) next = cont;
    }
    current = next;
  }
  return current;
}

/** Pull a text query (+ optional coordinates) out of a full Maps URL. */
function extractQuery(mapsUrl: string): {
  textQuery: string | null;
  lat: number | null;
  lng: number | null;
} {
  const u = new URL(mapsUrl);
  let textQuery: string | null = null;
  let lat: number | null = null;
  let lng: number | null = null;

  const placeMatch = u.pathname.match(/\/maps\/place\/([^/]+)/);
  if (placeMatch) {
    textQuery = decodeURIComponent(placeMatch[1].replace(/\+/g, " "));
  }
  const at = u.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (at) {
    lat = parseFloat(at[1]);
    lng = parseFloat(at[2]);
  }
  if (!textQuery) {
    textQuery = u.searchParams.get("q") ?? u.searchParams.get("query");
  }
  // g.page/<slug> — use the slug as a search term
  if (!textQuery && u.hostname === "g.page") {
    const slug = u.pathname.replace(/^\/+|\/+$/g, "").replace(/^share\./, "");
    if (slug) textQuery = slug.replace(/-/g, " ");
  }
  return { textQuery, lat, lng };
}

type PlaceResource = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: Array<{
    longText?: string;
    types?: string[];
  }>;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  primaryTypeDisplayName?: { text?: string };
  types?: string[];
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
};

type PlacesTextSearchResponse = {
  places?: PlaceResource[];
  error?: { message?: string; status?: string };
};

const PLACE_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "addressComponents",
  "nationalPhoneNumber",
  "websiteUri",
  "primaryTypeDisplayName",
  "types",
  "rating",
  "userRatingCount",
  "googleMapsUri",
  "regularOpeningHours",
] as const;

function mapPlace(
  place: PlaceResource,
  fallbackName: string,
  fallbackUrl: string,
): GbpLookupResult {
  const comp = (type: string) =>
    place.addressComponents?.find((c) => c.types?.includes(type))?.longText ??
    null;

  return {
    placeId: place.id,
    name: place.displayName?.text ?? fallbackName,
    address: place.formattedAddress ?? null,
    city: comp("postal_town") ?? comp("locality") ?? null,
    postcode: comp("postal_code"),
    phone: place.nationalPhoneNumber ?? null,
    website: place.websiteUri ?? null,
    gbpUrl: place.googleMapsUri ?? fallbackUrl,
    primaryCategory: place.primaryTypeDisplayName?.text ?? null,
    types: place.types ?? [],
    rating: place.rating ?? null,
    reviewCount: place.userRatingCount ?? null,
    hours: place.regularOpeningHours?.weekdayDescriptions ?? [],
  };
}

export async function lookupGbpFromUrl(
  inputUrl: string,
  apiKey: string,
): Promise<{ ok: true; data: GbpLookupResult } | { ok: false; error: string }> {
  let mapsUrl: string;
  try {
    mapsUrl = await resolveMapsUrl(inputUrl.trim());
  } catch {
    return { ok: false, error: "Could not resolve that URL — check the link." };
  }

  const { textQuery, lat, lng } = extractQuery(mapsUrl);
  if (!textQuery) {
    return {
      ok: false,
      error:
        "Couldn't find a business name in that link. Use the profile's share link or the full Maps URL.",
    };
  }

  const body: Record<string, unknown> = { textQuery, pageSize: 1 };
  if (lat !== null && lng !== null) {
    body.locationBias = {
      circle: { center: { latitude: lat, longitude: lng }, radius: 1000 },
    };
  }

  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": PLACE_FIELDS.map((f) => `places.${f}`).join(","),
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as PlacesTextSearchResponse;
  if (!res.ok) {
    return {
      ok: false,
      error: `Places API error: ${json.error?.message ?? res.status}`,
    };
  }
  const place = json.places?.[0];
  if (!place) {
    return {
      ok: false,
      error: `No place found for "${textQuery}". Try the full Maps URL of the listing.`,
    };
  }

  return { ok: true, data: mapPlace(place, textQuery, mapsUrl) };
}

/**
 * Fetch a listing's current public data directly by Place ID — deterministic,
 * so drift checks always compare against the same listing.
 */
export async function fetchPlaceDetails(
  placeId: string,
  apiKey: string,
): Promise<{ ok: true; data: GbpLookupResult } | { ok: false; error: string }> {
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": PLACE_FIELDS.join(","),
      },
    },
  );

  const json = (await res.json()) as PlaceResource & {
    error?: { message?: string };
  };
  if (!res.ok) {
    return {
      ok: false,
      error: `Places API error: ${json.error?.message ?? res.status}`,
    };
  }
  return { ok: true, data: mapPlace(json, "", "") };
}
