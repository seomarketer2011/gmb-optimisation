CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `audit_items` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`stable_key` text NOT NULL,
	`section` text NOT NULL,
	`sort_order` integer NOT NULL,
	`check_title` text NOT NULL,
	`check_question` text NOT NULL,
	`why_it_matters` text,
	`review_guidance` text,
	`evidence_required` integer DEFAULT false NOT NULL,
	`default_severity` text DEFAULT 'standard' NOT NULL,
	`risk_level` text DEFAULT 'low' NOT NULL,
	`recommended_action` text,
	`task_template_key` text,
	FOREIGN KEY (`template_id`) REFERENCES `audit_templates`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `audit_items_template_idx` ON `audit_items` (`template_id`);--> statement-breakpoint
CREATE TABLE `audit_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`version` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`source_file` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `audit_templates_key_version` ON `audit_templates` (`key`,`version`);--> statement-breakpoint
CREATE TABLE `audits` (
	`id` text PRIMARY KEY NOT NULL,
	`location_id` text NOT NULL,
	`template_id` text NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`run_by` text,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`notes` text,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `audit_templates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`run_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audits_location_idx` ON `audits` (`location_id`);--> statement-breakpoint
CREATE TABLE `changes` (
	`id` text PRIMARY KEY NOT NULL,
	`location_id` text NOT NULL,
	`task_id` text,
	`field` text NOT NULL,
	`previous_value` text,
	`proposed_value` text NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`risk_level` text DEFAULT 'low' NOT NULL,
	`approval_required` integer DEFAULT false NOT NULL,
	`proposed_by` text,
	`proposed_at` integer NOT NULL,
	`approved_by` text,
	`approved_at` integer,
	`submitted_by` text,
	`submitted_at` integer,
	`verified_by` text,
	`verified_at` integer,
	`external_status` text,
	`notes` text,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`proposed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`submitted_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`verified_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `changes_location_idx` ON `changes` (`location_id`);--> statement-breakpoint
CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `content_items` (
	`id` text PRIMARY KEY NOT NULL,
	`location_id` text NOT NULL,
	`task_id` text,
	`content_type` text NOT NULL,
	`title` text,
	`body` text NOT NULL,
	`cta` text,
	`cta_url` text,
	`media_brief` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`scheduled_for` integer,
	`published_at` integer,
	`published_by` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`published_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `content_items_location_idx` ON `content_items` (`location_id`);--> statement-breakpoint
CREATE INDEX `content_items_status_idx` ON `content_items` (`status`);--> statement-breakpoint
CREATE TABLE `findings` (
	`id` text PRIMARY KEY NOT NULL,
	`audit_id` text NOT NULL,
	`audit_item_id` text NOT NULL,
	`status` text NOT NULL,
	`severity` text DEFAULT 'standard' NOT NULL,
	`note` text,
	`snapshot_title` text,
	`snapshot_question` text,
	`task_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`audit_id`) REFERENCES `audits`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`audit_item_id`) REFERENCES `audit_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `findings_audit_idx` ON `findings` (`audit_id`);--> statement-breakpoint
CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`city` text,
	`postcode` text,
	`phone` text,
	`website` text,
	`gbp_url` text,
	`primary_category` text,
	`secondary_categories` text,
	`service_areas` text,
	`is_service_area_business` integer DEFAULT false NOT NULL,
	`description` text,
	`services` text,
	`status` text DEFAULT 'active' NOT NULL,
	`opportunity` text,
	`opportunity_rationale` text,
	`risk_level` text DEFAULT 'low' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `locations_client_idx` ON `locations` (`client_id`);--> statement-breakpoint
CREATE TABLE `metric_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`location_id` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`calls` integer,
	`website_clicks` integer,
	`directions` integer,
	`bookings` integer,
	`review_count` integer,
	`rating` real,
	`leads` integer,
	`qualified_leads` integer,
	`revenue_estimate` real,
	`notes` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `metric_snapshots_unique` ON `metric_snapshots` (`location_id`,`period_start`,`period_end`,`source`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `task_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`evidence_type` text DEFAULT 'note' NOT NULL,
	`storage_key` text,
	`original_filename` text,
	`mime_type` text,
	`size_bytes` integer,
	`caption` text,
	`text_content` text,
	`url` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `task_evidence_task_idx` ON `task_evidence` (`task_id`);--> statement-breakpoint
CREATE TABLE `task_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`version` integer NOT NULL,
	`title` text NOT NULL,
	`task_type` text NOT NULL,
	`instructions` text,
	`default_priority` text DEFAULT 'p2' NOT NULL,
	`default_risk` text DEFAULT 'low' NOT NULL,
	`definition_of_done` text,
	`approval_required` integer DEFAULT false NOT NULL,
	`default_due_days` integer,
	`recurrence_days` integer,
	`prepares_content` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_templates_key_version` ON `task_templates` (`key`,`version`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`location_id` text NOT NULL,
	`template_id` text,
	`title` text NOT NULL,
	`task_type` text DEFAULT 'profile' NOT NULL,
	`priority` text DEFAULT 'p2' NOT NULL,
	`risk_level` text DEFAULT 'low' NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`owner_id` text,
	`due_date` integer,
	`instructions` text,
	`definition_of_done` text,
	`approval_required` integer DEFAULT false NOT NULL,
	`approved_by` text,
	`approved_at` integer,
	`completed_by` text,
	`completed_at` integer,
	`source_stable_key` text,
	`previous_task_id` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `task_templates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`completed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tasks_location_idx` ON `tasks` (`location_id`);--> statement-breakpoint
CREATE INDEX `tasks_status_idx` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX `tasks_owner_idx` ON `tasks` (`owner_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`role` text DEFAULT 'va' NOT NULL,
	`client_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
