CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` blob NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`progress` text DEFAULT '{}' NOT NULL
);
