CREATE TABLE `cocoa_replies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reply_to_id` integer,
	`text` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`text` text NOT NULL,
	`created_at` integer NOT NULL
);
