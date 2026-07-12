"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { completeTask } from "@/app/(app)/tasks/actions";

export function TaskComplete({
  taskId,
  recurs,
  recurrenceDays,
}: {
  taskId: string;
  recurs: boolean;
  recurrenceDays: number | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [scheduleNext, setScheduleNext] = useState(recurs);
  const [error, setError] = useState<string | null>(null);

  function complete() {
    setError(null);
    start(async () => {
      const res = await completeTask(taskId, scheduleNext);
      if (!res.ok) {
        setError(res.reason);
        return;
      }
      if (res.nextTaskId) {
        router.push(`/tasks/${res.nextTaskId}`);
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {recurs && (
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <input
            type="checkbox"
            checked={scheduleNext}
            onChange={(e) => setScheduleNext(e.target.checked)}
          />
          Schedule next occurrence
          {recurrenceDays ? ` (in ${recurrenceDays} days)` : ""}
        </label>
      )}
      <Button onClick={complete} disabled={pending}>
        {pending ? "Completing…" : "Mark complete"}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
