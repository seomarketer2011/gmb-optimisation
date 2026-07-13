CREATE TABLE `gbp_baselines` (
	`id` text PRIMARY KEY NOT NULL,
	`location_id` text NOT NULL,
	`business_name` text NOT NULL,
	`address` text,
	`phone` text,
	`primary_category` text,
	`hours` text,
	`confirmed_by` text,
	`confirmed_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`confirmed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gbp_baselines_location_unique` ON `gbp_baselines` (`location_id`);--> statement-breakpoint
CREATE TABLE `integrity_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`location_id` text NOT NULL,
	`check_id` text,
	`field` text NOT NULL,
	`expected_value` text,
	`live_value` text,
	`status` text DEFAULT 'open' NOT NULL,
	`task_id` text,
	`resolved_by` text,
	`resolved_at` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`check_id`) REFERENCES `integrity_checks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`resolved_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `integrity_alerts_location_idx` ON `integrity_alerts` (`location_id`);--> statement-breakpoint
CREATE INDEX `integrity_alerts_status_idx` ON `integrity_alerts` (`status`);--> statement-breakpoint
CREATE TABLE `integrity_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`location_id` text NOT NULL,
	`status` text NOT NULL,
	`drift_fields` text,
	`live_snapshot` text,
	`error` text,
	`run_by` text,
	`run_at` integer NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `integrity_checks_location_idx` ON `integrity_checks` (`location_id`);--> statement-breakpoint
ALTER TABLE `locations` ADD `place_id` text;