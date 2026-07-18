import { getCloudflareContext } from "@opennextjs/cloudflare";

export const MISSING_KEY_ERROR =
  "Google Maps API key is not configured — add the GOOGLE_MAPS_API_KEY secret (see README) and this will light up.";

/** The one place that reads the Places API key from the environment. */
export async function getGoogleMapsKey(): Promise<string | null> {
  const { env } = await getCloudflareContext({ async: true });
  return env.GOOGLE_MAPS_API_KEY ?? null;
}
