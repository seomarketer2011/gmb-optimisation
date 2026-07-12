"use client";

import { useState } from "react";
import Papa from "papaparse";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import {
  importLocations,
  type ImportResult,
  type ImportRow,
} from "../actions";

const EXPECTED_COLUMNS = [
  "client_name",
  "location_name",
  "address",
  "city",
  "postcode",
  "phone",
  "website",
  "gbp_url",
  "primary_category",
  "status",
];

const TEMPLATE_CSV =
  EXPECTED_COLUMNS.join(",") +
  "\n" +
  'Acme Fire Doors,Acme Fire Doors Croydon,"12 High St",Croydon,CR0 1AB,020 1234 5678,https://acmefiredoors.co.uk/croydon,https://maps.google.com/?cid=123,Fire protection service,active\n';

export function ImportClient() {
  const router = useRouter();
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setParseError(null);
    Papa.parse<ImportRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
      complete: (res) => {
        const fields = res.meta.fields ?? [];
        if (
          !fields.includes("client_name") ||
          !fields.includes("location_name")
        ) {
          setParseError(
            `CSV must contain at least client_name and location_name columns. Found: ${fields.join(", ")}`,
          );
          setRows([]);
          return;
        }
        setRows(res.data);
      },
      error: (err) => setParseError(err.message),
    });
  }

  async function runImport() {
    setBusy(true);
    try {
      const res = await importLocations(rows);
      setResult(res);
      setRows([]);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "locations-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <Card>
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">
          Expected columns:{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 text-xs dark:bg-gray-800">
            {EXPECTED_COLUMNS.join(", ")}
          </code>
        </p>
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          Clients are created automatically if they don&apos;t exist (matched
          by name). Locations that already exist for a client are skipped, so
          re-importing is safe.
        </p>
        <div className="flex items-center gap-3">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
            className="text-sm"
          />
          <Button variant="secondary" onClick={downloadTemplate} type="button">
            Download template
          </Button>
        </div>
        {parseError && (
          <p className="mt-3 text-sm text-red-600">{parseError}</p>
        )}
      </Card>

      {rows.length > 0 && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium">
              {fileName}: {rows.length} row{rows.length === 1 ? "" : "s"} ready
              to import
            </p>
            <Button onClick={runImport} disabled={busy}>
              {busy ? "Importing…" : `Import ${rows.length} locations`}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500 dark:border-gray-700">
                  <th className="px-2 py-2 font-medium">Client</th>
                  <th className="px-2 py-2 font-medium">Location</th>
                  <th className="px-2 py-2 font-medium">City</th>
                  <th className="px-2 py-2 font-medium">Phone</th>
                  <th className="px-2 py-2 font-medium">Category</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 20).map((r, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-100 last:border-0 dark:border-gray-800"
                  >
                    <td className="px-2 py-1.5">{r.client_name}</td>
                    <td className="px-2 py-1.5">{r.location_name}</td>
                    <td className="px-2 py-1.5">{r.city ?? ""}</td>
                    <td className="px-2 py-1.5">{r.phone ?? ""}</td>
                    <td className="px-2 py-1.5">{r.primary_category ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 20 && (
              <p className="mt-2 text-xs text-gray-500">
                Showing first 20 of {rows.length} rows.
              </p>
            )}
          </div>
        </Card>
      )}

      {result && (
        <Card>
          <p className="text-sm font-medium text-green-700 dark:text-green-400">
            Import complete: {result.locationsCreated} locations created,{" "}
            {result.clientsCreated} new clients.
          </p>
          {result.skipped.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-sm text-yellow-700 dark:text-yellow-400">
              {result.skipped.map((s) => (
                <li key={s.row}>
                  Row {s.row}: {s.reason}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
