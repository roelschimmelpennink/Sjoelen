CREATE TABLE `room_previews` (
	`room_id` text PRIMARY KEY NOT NULL,
	`seat` integer NOT NULL,
	`revision` integer NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer NOT NULL
);
