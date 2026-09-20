CREATE TABLE `cards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`deck_id` integer NOT NULL,
	`card_type` text NOT NULL,
	`word_id` integer,
	`sentence_id` integer,
	`pattern_id` integer,
	`state` text DEFAULT 'new' NOT NULL,
	`due` integer NOT NULL,
	`stability` real DEFAULT 0 NOT NULL,
	`difficulty` real DEFAULT 0 NOT NULL,
	`elapsed_days` integer DEFAULT 0 NOT NULL,
	`scheduled_days` integer DEFAULT 0 NOT NULL,
	`reps` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`last_review` integer,
	`suspended` integer DEFAULT false NOT NULL,
	`is_leech` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`deck_id`) REFERENCES `decks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "cards_type_ck" CHECK("cards"."card_type" IN ('recognition','typing','audio')),
	CONSTRAINT "cards_state_ck" CHECK("cards"."state" IN ('new','learning','review','relearning')),
	CONSTRAINT "cards_one_item_ck" CHECK(("cards"."word_id" IS NOT NULL) + ("cards"."sentence_id" IS NOT NULL) + ("cards"."pattern_id" IS NOT NULL) = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cards_user_type_word_unq` ON `cards` (`user_id`,`card_type`,`word_id`);--> statement-breakpoint
CREATE INDEX `cards_due_idx` ON `cards` (`user_id`,`due`) WHERE "cards"."suspended" = 0;--> statement-breakpoint
CREATE INDEX `cards_deck_idx` ON `cards` (`deck_id`);--> statement-breakpoint
CREATE TABLE `deck_words` (
	`deck_id` integer NOT NULL,
	`word_id` integer NOT NULL,
	`added_at` integer NOT NULL,
	`source` text NOT NULL,
	`introduction_rank` integer NOT NULL,
	PRIMARY KEY(`deck_id`, `word_id`),
	FOREIGN KEY (`deck_id`) REFERENCES `decks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "deck_words_source_ck" CHECK("deck_words"."source" IN ('hsk','duchinese','reader','manual'))
);
--> statement-breakpoint
CREATE INDEX `deck_words_rank_idx` ON `deck_words` (`deck_id`,`introduction_rank`);--> statement-breakpoint
CREATE TABLE `decks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`enabled_card_types` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `decks_user_name_unq` ON `decks` (`user_id`,`name`);--> statement-breakpoint
CREATE TABLE `examples` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`simplified` text NOT NULL,
	`pinyin` text NOT NULL,
	`translation` text NOT NULL,
	`source` text DEFAULT 'duchinese' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `examples_simplified_unq` ON `examples` (`simplified`);--> statement-breakpoint
CREATE TABLE `readings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`word_id` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`pinyin` text NOT NULL,
	`pinyin_numeric` text NOT NULL,
	`meanings` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `readings_word_idx` ON `readings` (`word_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `readings_word_pinyin_unq` ON `readings` (`word_id`,`pinyin`);--> statement-breakpoint
CREATE TABLE `review_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`card_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`rating` integer NOT NULL,
	`state_before` text NOT NULL,
	`due_before` integer NOT NULL,
	`stability_before` real NOT NULL,
	`difficulty_before` real NOT NULL,
	`elapsed_days_before` integer NOT NULL,
	`scheduled_days_before` integer NOT NULL,
	`reps_before` integer NOT NULL,
	`lapses_before` integer NOT NULL,
	`last_review_before` integer,
	`source` text DEFAULT 'review' NOT NULL,
	`duration_ms` integer,
	`typed_answer` text,
	`reviewed_at` integer NOT NULL,
	`voided` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "review_log_rating_ck" CHECK("review_log"."rating" BETWEEN 1 AND 4),
	CONSTRAINT "review_log_source_ck" CHECK("review_log"."source" IN ('review','seed','know'))
);
--> statement-breakpoint
CREATE INDEX `review_log_card_idx` ON `review_log` (`card_id`,`reviewed_at`);--> statement-breakpoint
CREATE INDEX `review_log_user_idx` ON `review_log` (`user_id`,`reviewed_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`new_words_per_day` integer NOT NULL,
	`max_reviews_per_day` integer NOT NULL,
	`desired_retention` real NOT NULL,
	`fsrs_params` text,
	`timezone` text NOT NULL,
	`day_cutoff_hour` integer NOT NULL,
	`calibrated_at` integer
);
--> statement-breakpoint
CREATE TABLE `word_examples` (
	`word_id` integer NOT NULL,
	`example_id` integer NOT NULL,
	PRIMARY KEY(`word_id`, `example_id`),
	FOREIGN KEY (`word_id`) REFERENCES `words`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`example_id`) REFERENCES `examples`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `words` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`simplified` text NOT NULL,
	`hsk_new` text,
	`hsk_old` text,
	`frequency_rank` integer,
	`radical` text,
	`pos` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `words_simplified_unq` ON `words` (`simplified`);--> statement-breakpoint
CREATE INDEX `words_hsk_new_idx` ON `words` (`hsk_new`);--> statement-breakpoint
CREATE INDEX `words_freq_idx` ON `words` (`frequency_rank`);