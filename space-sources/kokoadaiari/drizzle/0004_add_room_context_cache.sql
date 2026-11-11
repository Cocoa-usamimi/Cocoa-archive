CREATE TABLE `room_context_cache` (
	`id` integer PRIMARY KEY NOT NULL,
	`date` text,
	`available` integer DEFAULT 0 NOT NULL,
	`weather_line` text,
	`posts_json` text,
	`anniversary_label` text,
	`status` text DEFAULT 'idle' NOT NULL,
	`task_id` text,
	`last_attempt_at` integer
);
