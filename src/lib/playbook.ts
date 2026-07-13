import playbookJson from "../../data/playbooks/rank-and-rent-v1.json";

export type PlaybookStep = {
  key: string;
  title: string;
  priority: string;
  goal: string;
  instructions: string;
  done_when: string;
  evidence_required: boolean;
};

export type PlaybookPhase = {
  key: string;
  title: string;
  description: string;
  steps: PlaybookStep[];
};

export type Playbook = {
  key: string;
  version: number;
  name: string;
  description: string;
  phases: PlaybookPhase[];
};

export const playbook = playbookJson as Playbook;

/** Stable key stored on tasks created from a playbook step. */
export function stepStableKey(stepKey: string) {
  return `pb:${playbook.key}:${stepKey}`;
}

export function findStep(stepKey: string): PlaybookStep | undefined {
  for (const phase of playbook.phases) {
    const step = phase.steps.find((s) => s.key === stepKey);
    if (step) return step;
  }
  return undefined;
}

export const allStepKeys = playbook.phases.flatMap((p) =>
  p.steps.map((s) => s.key),
);

/** The GBP-specific phase (profile creation + full tag fill). */
export const GBP_PHASE_KEY = "p3";

/** Task types that count as GBP work (vs website/authority work). */
export const GBP_TASK_TYPES = [
  "profile",
  "categories_services",
  "reviews",
  "media",
  "posts",
  "monitoring",
];

/** A step is complete when its latest task is done or validated. */
export function stepStatusFromTask(
  taskStatus: string | undefined,
): "not_started" | "in_progress" | "done" {
  if (!taskStatus) return "not_started";
  if (["done", "validated"].includes(taskStatus)) return "done";
  if (taskStatus === "rejected") return "not_started";
  return "in_progress";
}
