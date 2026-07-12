type FindingLike = {
  status: string; // pass | fail | na
  severity: string; // critical | important | standard
};

const WEIGHT: Record<string, number> = {
  critical: 3,
  important: 2,
  standard: 1,
};

/**
 * Health score from a completed audit: weighted passes over weighted
 * pass+fail. N/A findings are excluded. Returns null when nothing was
 * assessed.
 */
export function healthScore(findings: FindingLike[]): number | null {
  let passed = 0;
  let total = 0;
  for (const f of findings) {
    if (f.status === "na") continue;
    const w = WEIGHT[f.severity] ?? 1;
    total += w;
    if (f.status === "pass") passed += w;
  }
  if (total === 0) return null;
  return Math.round((passed / total) * 100);
}

export function healthColor(score: number): "green" | "yellow" | "red" {
  if (score >= 80) return "green";
  if (score >= 55) return "yellow";
  return "red";
}
