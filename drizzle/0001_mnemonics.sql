CREATE TABLE `mnemonics` (
	`user_id` text NOT NULL,
	`word_id` integer NOT NULL,
	`text` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `word_id`),
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `review_log` ADD `used_hint` integer DEFAULT false NOT NULL;