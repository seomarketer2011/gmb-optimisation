import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireSession } from "@/lib/session";
import {
  Badge,
  Button,
  Card,
  Input,
  Label,
  PageHeader,
  Select,
  Textarea,
  statusBadgeColor,
} from "@/components/ui";
import { proposeChange, setChangeStatus } from "./actions";

export const dynamic = "force-dynamic";

const FIELDS = [
  { value: "business_name", label: "Business name (sensitive)" },
  { value: "primary_category", label: "Primary category (sensitive)" },
  { value: "address", label: "Address (sensitive)" },
  { value: "map_pin", label: "Map pin (sensitive)" },
  { value: "phone", label: "Phone (sensitive)" },
  { value: "website", label: "Website (sensitive)" },
  { value: "service_areas", label: "Service areas (sensitive)" },
  { value: "hours", label: "Hours" },
  { value: "description", label: "Description" },
  { value: "other", label: "Other" },
];

export default async function ChangesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const role = (session.user as { role?: string }).role ?? "va";
  const canApprove = role === "admin" || role === "operator";
  const { id } = await params;
  const db = await getDb();

  const location = await db.query.locations.findFirst({
    where: eq(schema.locations.id, id),
  });
  if (!location) notFound();

  const changes = await db
    .select()
    .from(schema.changes)
    .where(eq(schema.changes.locationId, id))
    .orderBy(desc(schema.changes.proposedAt));

  const propose = proposeChange.bind(null, id);

  return (
    <div>
      <PageHeader
        title={`Change log — ${location.name}`}
        subtitle={
          <>
            Every profile edit: what changed, who approved it, what Google did
            with it.{" "}
            <Link
              href={`/locations/${id}`}
              className="text-blue-600 hover:underline"
            >
              Back to location
            </Link>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {changes.length === 0 && (
            <Card>
              <p className="text-sm text-gray-500">
                No changes recorded yet. Propose one before editing the live
                profile — sensitive fields need operator approval first.
              </p>
            </Card>
          )}
          {changes.map((c) => (
            <Card key={c.id}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {c.field.replace(/_/g, " ")}
                </span>
                <Badge color={statusBadgeColor(c.status)}>{c.status}</Badge>
                <Badge
                  color={
                    c.riskLevel === "high"
                      ? "red"
                      : c.riskLevel === "medium"
                        ? "yellow"
                        : "gray"
                  }
                >
                  risk: {c.riskLevel}
                </Badge>
                <span className="text-xs text-gray-500">
                  {c.proposedAt.toISOString().slice(0, 10)}
                </span>
              </div>
              <div className="grid gap-2 text-sm md:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase text-gray-500">
                    Previous
                  </p>
                  <p className="whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                    {c.previousValue ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-gray-500">
                    Proposed
                  </p>
                  <p className="whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                    {c.proposedValue}
                  </p>
                </div>
              </div>
              {c.notes && (
                <p className="mt-2 text-sm text-gray-500">{c.notes}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
                {c.status === "proposed" && c.approvalRequired && canApprove && (
                  <form action={setChangeStatus.bind(null, c.id, "approved")}>
                    <Button type="submit">Approve</Button>
                  </form>
                )}
                {c.status === "proposed" && c.approvalRequired && !canApprove && (
                  <p className="text-sm text-red-600">
                    Awaiting operator approval — do not edit the live profile
                    yet.
                  </p>
                )}
                {(c.status === "approved" ||
                  (c.status === "proposed" && !c.approvalRequired)) && (
                  <form action={setChangeStatus.bind(null, c.id, "submitted")}>
                    <Button type="submit" variant="secondary">
                      Mark submitted to Google
                    </Button>
                  </form>
                )}
                {c.status === "submitted" && (
                  <>
                    <form action={setChangeStatus.bind(null, c.id, "accepted")}>
                      <Button type="submit" variant="secondary">
                        Google accepted
                      </Button>
                    </form>
                    <form action={setChangeStatus.bind(null, c.id, "rejected")}>
                      <Button type="submit" variant="secondary">
                        Google rejected
                      </Button>
                    </form>
                  </>
                )}
                {canApprove &&
                  ["accepted", "submitted"].includes(c.status) && (
                    <form action={setChangeStatus.bind(null, c.id, "reverted")}>
                      <Button type="submit" variant="danger">
                        Reverted
                      </Button>
                    </form>
                  )}
              </div>
            </Card>
          ))}
        </div>

        <Card className="h-fit">
          <h2 className="mb-3 font-medium">Propose a change</h2>
          <form action={propose} className="space-y-3">
            <div>
              <Label htmlFor="field">Field</Label>
              <Select id="field" name="field" required>
                {FIELDS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="previousValue">Current value (for rollback)</Label>
              <Textarea id="previousValue" name="previousValue" rows={2} />
            </div>
            <div>
              <Label htmlFor="proposedValue">Proposed value *</Label>
              <Textarea id="proposedValue" name="proposedValue" rows={2} required />
            </div>
            <div>
              <Label htmlFor="notes">Why / notes</Label>
              <Input id="notes" name="notes" />
            </div>
            <Button type="submit">Propose</Button>
          </form>
          <p className="mt-3 text-xs text-gray-500">
            Sensitive fields (name, category, address, pin, phone, website,
            service areas) require operator approval before the profile is
            touched. Avoid submitting several sensitive changes at once.
          </p>
        </Card>
      </div>
    </div>
  );
}
