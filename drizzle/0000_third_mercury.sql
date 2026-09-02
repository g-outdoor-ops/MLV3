CREATE TABLE `app_state` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` text
);
--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`summary` text NOT NULL,
	`created_at` text NOT NULL
);
