"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label, Select } from "@/components/ui";
import type { GbpLookupResult } from "@/lib/places";
import { importGbpProperty, lookupGbp } from "./actions";

export function GbpImportClient({
  niches,
}: {
  niches: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [nicheId, setNicheId] = useState("");
  const [preview, setPreview] = useState<GbpLookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function fetchProfile() {
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

  const rows: [string, string | null][] = preview
    ? [
        ["Business name", preview.name],
        ["Primary category", preview.primaryCategory],
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

  return (
    <div className="max-w-3xl space-y-4">
      <Card>
        <Label htmlFor="url">GBP / Maps URL</Label>
        <div className="flex gap-2">
          <Input
            id="url"
            placeholder="https://maps.app.goo.gl/…  or  https://www.google.com/maps/place/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Button onClick={fetchProfile} disabled={busy || !url.trim()}>
            {busy && !preview ? "Fetching…" : "Fetch profile"}
          </Button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </Card>

      {preview && (
        <Card>
          <h2 className="mb-3 font-medium">Live profile data</h2>
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
