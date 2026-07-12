import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireSession } from "@/lib/session";
import { healthScore, healthColor } from "@/lib/scores";
import {
  Badge,
  Button,
  Card,
  Input,
  PageHeader,
  statusBadgeColor,
} from "@/components/ui";
import { completeAudit, createTaskFromFinding, setFinding } from "../actions";

export const dynamic = "force-dynamic";

const SECTION_LABELS: Record<string, string> = {
  eligibility_risk: "A · Eligibility & risk",
  accuracy: "B · Profile accuracy",
  relevance: "C · Relevance",
  prominence: "D · Prominence & trust",
  content: "E · Content & freshness",
  conversion: "F · Conversion readiness",
  visibility: "G · Local visibility",
};

function severityColor(s: string) {
  return s === "critical" ? "red" : s === "important" ? "yellow" : "gray";
}

export default async function AuditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;
  const db = await getDb();

  const audit = await db.query.audits.findFirst({
    where: eq(schema.audits.id, id),
  });
  if (!audit) notFound();

  const [location, template, items, findings] = await Promise.all([
    db.query.locations.findFirst({
      where: eq(schema.locations.id, audit.locationId),
    }),
    db.query.auditTemplates.findFirst({
      where: eq(schema.auditTemplates.id, audit.templateId),
    }),
    db
      .select()
      .from(schema.auditItems)
      .where(eq(schema.auditItems.templateId, audit.templateId))
      .orderBy(asc(schema.auditItems.sortOrder)),
    db
      .select()
      .from(schema.findings)
      .where(eq(schema.findings.auditId, id)),
  ]);

  const findingByItem = new Map(findings.map((f) => [f.auditItemId, f]));
  const assessed = findings.length;
  const failCount = findings.filter((f) => f.status === "fail").length;
  const inProgress = audit.status === "in_progress";
  const score = healthScore(findings);

  const sections = new Map<string, typeof items>();
  for (const item of items) {
    const list = sections.get(item.section) ?? [];
    list.push(item);
    sections.set(item.section, list);
  }

  return (
    <div>
      <PageHeader
        title={`${template?.name ?? "Audit"} — ${location?.name ?? ""}`}
        subtitle={
          <>
            Template v{template?.version} ·{" "}
            <Link
              href={`/locations/${audit.locationId}`}
              className="text-blue-600 hover:underline"
            >
              back to location
            </Link>
          </>
        }
        actions={
          inProgress ? (
            <form action={completeAudit.bind(null, audit.id)}>
              <Button type="submit">Complete audit</Button>
            </form>
          ) : undefined
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Badge color={statusBadgeColor(audit.status)}>
          {audit.status.replace("_", " ")}
        </Badge>
        <span className="text-sm text-gray-500">
          {assessed}/{items.length} checks assessed · {failCount} failing
        </span>
        {score !== null && (
          <Badge color={healthColor(score)}>Health: {score}%</Badge>
        )}
      </div>

      {!inProgress && failCount > 0 && (
        <Card className="mb-6">
          <h2 className="mb-2 font-medium">Failing checks</h2>
          <ul className="space-y-1 text-sm">
            {findings
              .filter((f) => f.status === "fail")
              .map((f) => (
                <li key={f.id} className="flex items-center gap-2">
                  <Badge color={severityColor(f.severity)}>{f.severity}</Badge>
                  <span>{f.snapshotTitle}</span>
                  {f.taskId ? (
                    <Link
                      href={`/tasks/${f.taskId}`}
                      className="text-blue-600 hover:underline"
                    >
                      → task
                    </Link>
                  ) : (
                    <span className="text-xs text-gray-500">(no task)</span>
                  )}
                </li>
              ))}
          </ul>
        </Card>
      )}

      <div className="space-y-6">
        {[...sections.entries()].map(([section, sectionItems]) => (
          <section key={section}>
            <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
              {SECTION_LABELS[section] ?? section}
            </h2>
            <div className="space-y-3">
              {sectionItems.map((item) => {
                const finding = findingByItem.get(item.id);
                const record = setFinding.bind(null, audit.id, item.id);
                return (
                  <Card key={item.id}>
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-medium">{item.checkTitle}</span>
                      <Badge color={severityColor(item.defaultSeverity)}>
                        {item.defaultSeverity}
                      </Badge>
                      {finding && (
                        <Badge
                          color={
                            finding.status === "pass"
                              ? "green"
                              : finding.status === "fail"
                                ? "red"
                                : "gray"
                          }
                        >
                          {finding.status.toUpperCase()}
                        </Badge>
                      )}
                    </div>
                    <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">
                      {item.checkQuestion}
                    </p>
                    {(item.whyItMatters || item.reviewGuidance) && (
                      <details className="mb-2 text-sm text-gray-500">
                        <summary className="cursor-pointer select-none">
                          Guidance
                        </summary>
                        {item.whyItMatters && (
                          <p className="mt-1">
                            <strong>Why it matters:</strong> {item.whyItMatters}
                          </p>
                        )}
                        {item.reviewGuidance && (
                          <p className="mt-1">
                            <strong>How to check:</strong> {item.reviewGuidance}
                          </p>
                        )}
                      </details>
                    )}

                    {inProgress && (
                      <form
                        action={record}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <Input
                          name="note"
                          placeholder="Note (optional)"
                          defaultValue={finding?.note ?? ""}
                          className="max-w-xs"
                        />
                        <button
                          type="submit"
                          name="status"
                          value="pass"
                          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                        >
                          Pass
                        </button>
                        <button
                          type="submit"
                          name="status"
                          value="fail"
                          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                        >
                          Fail
                        </button>
                        <button
                          type="submit"
                          name="status"
                          value="na"
                          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                        >
                          N/A
                        </button>
                      </form>
                    )}

                    {finding?.status === "fail" && (
                      <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-800">
                        {finding.taskId ? (
                          <Link
                            href={`/tasks/${finding.taskId}`}
                            className="text-sm font-medium text-blue-600 hover:underline"
                          >
                            → Linked task
                          </Link>
                        ) : (
                          <form
                            action={createTaskFromFinding.bind(
                              null,
                              finding.id,
                            )}
                          >
                            <Button type="submit" variant="secondary">
                              Create / link task
                            </Button>
                            <span className="ml-2 text-xs text-gray-500">
                              Links to an existing open task for this check if
                              one exists.
                            </span>
                          </form>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
