"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export function EvidenceUpload({ taskId }: { taskId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<"before" | "after" | "file">("after");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("taskId", taskId);
      fd.set("evidenceType", kind);
      const res = await fetch("/api/evidence", { method: "POST", body: fd });
      if (!res.ok) {
        setError(`Upload failed (${res.status})`);
        return;
      }
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value as typeof kind)}
        className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800"
      >
        <option value="before">Before screenshot</option>
        <option value="after">After screenshot</option>
        <option value="file">Other file</option>
      </select>
      <input ref={fileRef} type="file" accept="image/*,.pdf" className="text-sm" />
      <Button type="button" variant="secondary" onClick={upload} disabled={busy}>
        {busy ? "Uploading…" : "Upload"}
      </Button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
