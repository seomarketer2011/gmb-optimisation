import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

const uuid = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull();

const updatedAt = () =>
  integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date())
    .notNull();

// ---------------------------------------------------------------------------
// Auth (better-auth managed tables, extended with role + client scoping)
// Roles: admin | operator | va | client
// ---------------------------------------------------------------------------

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .default(false)
    .notNull(),
  image: text("image"),
  role: text("role").default("va").notNull(),
  clientId: text("client_id"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", {
    mode: "timestamp",
  }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", {
    mode: "timestamp",
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Clients & locations
// ---------------------------------------------------------------------------

export const clients = sqliteTable("clients", {
  id: uuid(),
  name: text("name").notNull(),
  status: text("status").default("active").notNull(), // active | paused | archived
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const locations = sqliteTable(
  "locations",
  {
    id: uuid(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    address: text("address"),
    city: text("city"),
    postcode: text("postcode"),
    phone: text("phone"),
    website: text("website"),
    gbpUrl: text("gbp_url"),
    // Google Place ID — set at import, lets us re-fetch the live listing
    // deterministically for data-protection checks
    placeId: text("place_id"),
    primaryCategory: text("primary_category"),
    secondaryCategories: text("secondary_categories"), // comma-separated
    serviceAreas: text("service_areas"),
    isServiceAreaBusiness: integer("is_service_area_business", {
      mode: "boolean",
    })
      .default(false)
      .notNull(),
    description: text("description"),
    services: text("services"), // newline-separated service list, used for content prep
    status: text("status").default("active").notNull(), // active | onboarding | suspended | paused | archived
    // Opportunity is a manual judgement with a required rationale (no fake precision)
    opportunity: text("opportunity"), // low | medium | high
    opportunityRationale: text("opportunity_rationale"),
    riskLevel: text("risk_level").default("low").notNull(), // low | medium | high | critical
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("locations_client_idx").on(t.clientId)],
);

// ---------------------------------------------------------------------------
// Audit system (immutable, versioned templates seeded from /data)
// ---------------------------------------------------------------------------

export const auditTemplates = sqliteTable(
  "audit_templates",
  {
    id: text("id").primaryKey(), // deterministic, e.g. "at_gbp-core_v1"
    key: text("key").notNull(), // "gbp-core"
    version: integer("version").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    sourceFile: text("source_file"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("audit_templates_key_version").on(t.key, t.version)],
);

export const auditItems = sqliteTable(
  "audit_items",
  {
    id: text("id").primaryKey(), // deterministic: `${templateId}:${stableKey}`
    templateId: text("template_id")
      .notNull()
      .references(() => auditTemplates.id, { onDelete: "cascade" }),
    stableKey: text("stable_key").notNull(), // survives across template versions
    section: text("section").notNull(), // eligibility_risk | accuracy | relevance | prominence | content | conversion | visibility
    sortOrder: integer("sort_order").notNull(),
    checkTitle: text("check_title").notNull(),
    checkQuestion: text("check_question").notNull(),
    whyItMatters: text("why_it_matters"),
    reviewGuidance: text("review_guidance"),
    evidenceRequired: integer("evidence_required", { mode: "boolean" })
      .default(false)
      .notNull(),
    defaultSeverity: text("default_severity").default("standard").notNull(), // critical | important | standard
    riskLevel: text("risk_level").default("low").notNull(),
    recommendedAction: text("recommended_action"),
    taskTemplateKey: text("task_template_key"),
  },
  (t) => [index("audit_items_template_idx").on(t.templateId)],
);

export const audits = sqliteTable(
  "audits",
  {
    id: uuid(),
    locationId: text("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    templateId: text("template_id")
      .notNull()
      .references(() => auditTemplates.id),
    status: text("status").default("in_progress").notNull(), // in_progress | completed | abandoned
    runBy: text("run_by").references(() => user.id),
    startedAt: integer("started_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    notes: text("notes"),
  },
  (t) => [index("audits_location_idx").on(t.locationId)],
);

export const findings = sqliteTable(
  "findings",
  {
    id: uuid(),
    auditId: text("audit_id")
      .notNull()
      .references(() => audits.id, { onDelete: "cascade" }),
    auditItemId: text("audit_item_id")
      .notNull()
      .references(() => auditItems.id),
    status: text("status").notNull(), // pass | fail | na
    severity: text("severity").default("standard").notNull(),
    note: text("note"),
    // Snapshot of the displayed text so history stays trustworthy even if
    // seed handling changes later
    snapshotTitle: text("snapshot_title"),
    snapshotQuestion: text("snapshot_question"),
    // A repeated failure links to the already-open task instead of creating
    // a duplicate (findings -> task, per review)
    taskId: text("task_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("findings_audit_idx").on(t.auditId)],
);

// ---------------------------------------------------------------------------
// Task engine (templates are first-class, versioned, seeded from /data)
// ---------------------------------------------------------------------------

export const taskTemplates = sqliteTable(
  "task_templates",
  {
    id: text("id").primaryKey(), // deterministic, e.g. "tt_weekly-post_v1"
    key: text("key").notNull(),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    taskType: text("task_type").notNull(), // profile | categories_services | reviews | media | posts | website | authority | monitoring | reporting
    instructions: text("instructions"), // step-by-step VA instructions
    defaultPriority: text("default_priority").default("p2").notNull(), // p1 | p2 | p3
    defaultRisk: text("default_risk").default("low").notNull(),
    definitionOfDone: text("definition_of_done"),
    approvalRequired: integer("approval_required", { mode: "boolean" })
      .default(false)
      .notNull(),
    defaultDueDays: integer("default_due_days"),
    // "Complete and schedule next" interval — no recurrence engine in v1
    recurrenceDays: integer("recurrence_days"),
    preparesContent: integer("prepares_content", { mode: "boolean" })
      .default(false)
      .notNull(), // true when the task produces copy-paste content for the VA
    isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
  },
  (t) => [uniqueIndex("task_templates_key_version").on(t.key, t.version)],
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: uuid(),
    locationId: text("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    templateId: text("template_id").references(() => taskTemplates.id),
    title: text("title").notNull(),
    taskType: text("task_type").default("profile").notNull(),
    priority: text("priority").default("p2").notNull(), // p1 | p2 | p3
    riskLevel: text("risk_level").default("low").notNull(),
    status: text("status").default("todo").notNull(), // backlog | todo | in_progress | waiting | done | monitoring | validated | blocked | rejected
    ownerId: text("owner_id").references(() => user.id),
    dueDate: integer("due_date", { mode: "timestamp" }),
    instructions: text("instructions"),
    definitionOfDone: text("definition_of_done"),
    approvalRequired: integer("approval_required", { mode: "boolean" })
      .default(false)
      .notNull(),
    approvedBy: text("approved_by").references(() => user.id),
    approvedAt: integer("approved_at", { mode: "timestamp" }),
    completedBy: text("completed_by").references(() => user.id),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    // Audit-item stable key used for duplicate detection on re-audits
    sourceStableKey: text("source_stable_key"),
    // Recurrence chain: this task was created by completing that one
    previousTaskId: text("previous_task_id"),
    createdBy: text("created_by").references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("tasks_location_idx").on(t.locationId),
    index("tasks_status_idx").on(t.status),
    index("tasks_owner_idx").on(t.ownerId),
  ],
);

export const taskEvidence = sqliteTable(
  "task_evidence",
  {
    id: uuid(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    evidenceType: text("evidence_type").default("note").notNull(), // before | after | note | file | link
    storageKey: text("storage_key"), // R2 object key (provider-independent)
    originalFilename: text("original_filename"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    caption: text("caption"),
    textContent: text("text_content"),
    url: text("url"),
    createdBy: text("created_by").references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [index("task_evidence_task_idx").on(t.taskId)],
);

// ---------------------------------------------------------------------------
// Content library — prepared, copy-paste-ready content for the VA
// ---------------------------------------------------------------------------

export const contentItems = sqliteTable(
  "content_items",
  {
    id: uuid(),
    locationId: text("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
    contentType: text("content_type").notNull(), // post | offer | event | review_reply | qa | description | service | photo_brief
    title: text("title"),
    body: text("body").notNull(),
    cta: text("cta"), // e.g. "Call now", "Learn more"
    ctaUrl: text("cta_url"), // tracked URL with UTMs
    mediaBrief: text("media_brief"), // what image/video to attach
    status: text("status").default("draft").notNull(), // draft | ready | published | rejected | expired
    scheduledFor: integer("scheduled_for", { mode: "timestamp" }),
    publishedAt: integer("published_at", { mode: "timestamp" }),
    publishedBy: text("published_by").references(() => user.id),
    createdBy: text("created_by").references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("content_items_location_idx").on(t.locationId),
    index("content_items_status_idx").on(t.status),
  ],
);

// ---------------------------------------------------------------------------
// Change log — accountable history for every profile edit
// ---------------------------------------------------------------------------

export const changes = sqliteTable(
  "changes",
  {
    id: uuid(),
    locationId: text("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    taskId: text("task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
    field: text("field").notNull(), // business_name | primary_category | address | map_pin | phone | website | service_areas | hours | description | other
    previousValue: text("previous_value"),
    proposedValue: text("proposed_value").notNull(),
    status: text("status").default("proposed").notNull(), // proposed | approved | submitted | accepted | rejected | reverted | superseded
    riskLevel: text("risk_level").default("low").notNull(),
    approvalRequired: integer("approval_required", { mode: "boolean" })
      .default(false)
      .notNull(),
    proposedBy: text("proposed_by").references(() => user.id),
    proposedAt: integer("proposed_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    approvedBy: text("approved_by").references(() => user.id),
    approvedAt: integer("approved_at", { mode: "timestamp" }),
    submittedBy: text("submitted_by").references(() => user.id),
    submittedAt: integer("submitted_at", { mode: "timestamp" }),
    verifiedBy: text("verified_by").references(() => user.id),
    verifiedAt: integer("verified_at", { mode: "timestamp" }),
    externalStatus: text("external_status"), // what Google shows: pending | live | rejected
    notes: text("notes"),
  },
  (t) => [index("changes_location_idx").on(t.locationId)],
);

// ---------------------------------------------------------------------------
// Listing protection — the confirmed source-of-truth for each property's
// critical GBP data, re-checked against the live listing to catch Google
// "suggested edits" (or anyone else) silently changing our data
// ---------------------------------------------------------------------------

export const gbpBaselines = sqliteTable(
  "gbp_baselines",
  {
    id: uuid(),
    locationId: text("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    businessName: text("business_name").notNull(),
    address: text("address"),
    phone: text("phone"),
    primaryCategory: text("primary_category"),
    hours: text("hours"), // JSON array of weekday descriptions, Monday first
    // Snapshotted from the live listing at confirm time (not user-typed)
    businessStatus: text("business_status"), // OPERATIONAL | CLOSED_TEMPORARILY | CLOSED_PERMANENTLY
    latitude: real("latitude"),
    longitude: real("longitude"),
    confirmedBy: text("confirmed_by").references(() => user.id),
    confirmedAt: integer("confirmed_at", { mode: "timestamp" }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("gbp_baselines_location_unique").on(t.locationId)],
);

export const integrityChecks = sqliteTable(
  "integrity_checks",
  {
    id: uuid(),
    locationId: text("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    status: text("status").notNull(), // ok | drift | error
    driftFields: text("drift_fields"), // comma-separated field keys that changed
    liveSnapshot: text("live_snapshot"), // JSON of the fetched live values
    error: text("error"),
    runBy: text("run_by").references(() => user.id),
    runAt: integer("run_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [index("integrity_checks_location_idx").on(t.locationId)],
);

export const integrityAlerts = sqliteTable(
  "integrity_alerts",
  {
    id: uuid(),
    locationId: text("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    checkId: text("check_id").references(() => integrityChecks.id, {
      onDelete: "set null",
    }),
    field: text("field").notNull(), // business_name | address | phone | hours | primary_category
    expectedValue: text("expected_value"),
    liveValue: text("live_value"),
    status: text("status").default("open").notNull(), // open | resolved | dismissed
    // Auto-created "restore correct data" task for the VA queue
    taskId: text("task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
    resolvedBy: text("resolved_by").references(() => user.id),
    resolvedAt: integer("resolved_at", { mode: "timestamp" }),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [
    index("integrity_alerts_location_idx").on(t.locationId),
    index("integrity_alerts_status_idx").on(t.status),
  ],
);

// ---------------------------------------------------------------------------
// Metric snapshots — manual in v1, imports/API later (source-tagged)
// ---------------------------------------------------------------------------

export const metricSnapshots = sqliteTable(
  "metric_snapshots",
  {
    id: uuid(),
    locationId: text("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    periodStart: text("period_start").notNull(), // ISO date, e.g. 2026-07-01
    periodEnd: text("period_end").notNull(),
    source: text("source").default("manual").notNull(), // manual | gbp_export | gbp_api | call_tracker | crm | combined
    calls: integer("calls"),
    websiteClicks: integer("website_clicks"),
    directions: integer("directions"),
    bookings: integer("bookings"),
    reviewCount: integer("review_count"),
    rating: real("rating"),
    leads: integer("leads"),
    qualifiedLeads: integer("qualified_leads"),
    revenueEstimate: real("revenue_estimate"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("metric_snapshots_unique").on(
      t.locationId,
      t.periodStart,
      t.periodEnd,
      t.source,
    ),
  ],
);
