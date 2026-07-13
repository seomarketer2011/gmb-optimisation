"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label, Select } from "@/components/ui";
import type { GbpLookupResult, PlaceCandidate } from "@/lib/places";
import {
  importGbpProperty,
  lookupGbp,
  lookupGbpByPlaceId,
  searchGbp,
} from "./actions";

export function GbpImportClient({
  niches,
}: {
  niches: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"name" | "url">("name");

  // name search
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  // url paste
  const [url, setUrl] = useState("");

  // shared
  const [nicheId, setNicheId] = useState("");
  const [preview, setPreview] = useState<GbpLookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const seq = useRef(0);

  // Debounced live search as you type (min 3 chars)
  useEffect(() => {
    if (mode !== "name") return;
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setSearched(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      const res = await searchGbp(q);
      if (mine !== seq.current) return; // a newer keystroke superseded this
      setSearching(false);
      setSearched(true);
      if (!res.ok) {
        setError(res.error);
        setResults([]);
        return;
      }
      setError(null);
      setResults(res.data);
    }, 400);
    return () => clearTimeout(t);
  }, [query, mode]);

  function selectCandidate(c: PlaceCandidate) {
    setError(null);
    setPreview(null);
    start(async () => {
      const res = await lookupGbpByPlaceId(c.placeId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPreview(res.data);
    });
  }

  function fetchFromUrl() {
    setError(null);
    setPreview(null);
    start(async () => {
      const res = await lookupGbp(url);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPreview(res.data);
    });
  }

  function save() {
    if (!preview) return;
    setError(null);
    start(async () => {
      const res = await importGbpProperty(preview, nicheId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/locations/${res.locationId}`);
      router.refresh();
    });
  }

  function reset() {
    setPreview(null);
    setError(null);
  }

  const rows: [string, string | null][] = preview
    ? [
        ["Business name", preview.name],
        ["Primary category", preview.primaryCategory],
        [
          "Other categories",
          preview.secondaryCategories.length
            ? preview.secondaryCategories.join(" · ")
            : null,
        ],
        ["Address", preview.address],
        ["Town", preview.city],
        ["Postcode", preview.postcode],
        ["Phone", preview.phone],
        ["Website", preview.website],
        ["Maps URL", preview.gbpUrl],
        [
          "Reviews",
          preview.reviewCount !== null
            ? `${preview.reviewCount} reviews · ${preview.rating ?? "—"}★`
            : null,
        ],
        ["Hours", preview.hours.length ? preview.hours.join(" · ") : null],
      ]
    : [];

  const tab = (key: "name" | "url", label: string) => (
    <button
      type="button"
      onClick={() => {
        setMode(key);
        reset();
      }}
      className={`rounded-md px-3 py-1.5 text-sm ${
        mode === key
          ? "bg-blue-600 text-white"
          : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex gap-2">
        {tab("name", "Search by name")}
        {tab("url", "Paste a Maps link")}
      </div>

      {mode === "name" ? (
        <Card>
          <Label htmlFor="q">Business name</Label>
          <Input
            id="q"
            placeholder="Start typing a business name, e.g. Brighton Plumbing…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <p className="mt-2 text-xs text-gray-500">
            Add the town or postcode if the name is common (e.g. &ldquo;Smith
            Plumbing Brighton&rdquo;). Matches come live from Google.
          </p>

          {searching && (
            <p className="mt-3 text-sm text-gray-500">Searching Google…</p>
          )}
          {!searching && searched && results.length === 0 && !error && (
            <p className="mt-3 text-sm text-gray-500">
              No matches. Try adding the town/postcode, or paste the Maps link
              instead.
            </p>
          )}
          {results.length > 0 && (
            <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
              {results.map((c) => (
                <li key={c.placeId}>
                  <button
                    type="button"
                    onClick={() => selectCandidate(c)}
                    disabled={busy}
                    className="flex w-full items-start justify-between gap-3 py-3 text-left hover:bg-gray-50 disabled:opacity-50 dark:hover:bg-gray-800"
                  >
                    <span>
                      <span className="block font-medium">{c.name}</span>
                      {c.address && (
                        <span className="block text-sm text-gray-500">
                          {c.address}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 pt-0.5 text-xs text-gray-400">
                      {c.primaryCategory ?? ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : (
        <Card>
          <Label htmlFor="url">GBP / Maps URL</Label>
          <div className="flex gap-2">
            <Input
              id="url"
              placeholder="https://maps.app.goo.gl/…  or  https://www.google.com/maps/place/…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Button onClick={fetchFromUrl} disabled={busy || !url.trim()}>
              {busy && !preview ? "Fetching…" : "Fetch profile"}
            </Button>
          </div>
        </Card>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {busy && !preview && mode === "name" && (
        <p className="text-sm text-gray-500">Loading listing…</p>
      )}

      {preview && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">Live profile data</h2>
            <button
              type="button"
              onClick={reset}
              className="text-sm text-blue-600 hover:underline"
            >
              ← Back to results
            </button>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {rows.map(
                ([label, value]) =>
                  value && (
                    <tr
                      key={label}
                      className="border-b border-gray-100 last:border-0 dark:border-gray-800"
                    >
                      <td className="w-40 py-2 align-top text-gray-500">
                        {label}
                      </td>
                      <td className="py-2">{value}</td>
                    </tr>
                  ),
              )}
            </tbody>
          </table>
          <div className="mt-4 flex items-end gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
            <div className="w-64">
              <Label htmlFor="niche">Niche *</Label>
              <Select
                id="niche"
                value={nicheId}
                onChange={(e) => setNicheId(e.target.value)}
              >
                <option value="">Select a niche…</option>
                {niches.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button onClick={save} disabled={busy || !nicheId}>
              {busy ? "Saving…" : "Create property from this profile"}
            </Button>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            Review count and rating are also saved as this month&apos;s baseline
            metric snapshot, so improvement is measurable from day one.
          </p>
        </Card>
      )}
    </div>
  );
}
