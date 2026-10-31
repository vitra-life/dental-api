-- Appointments store their length as a duration instead of an end time, and
-- no longer carry a price (pricing lives on services and, later, invoices).

-- Add the column as nullable first so existing rows can be filled in.
ALTER TABLE `appointments` ADD COLUMN `duration_minutes` SMALLINT UNSIGNED NULL;

UPDATE `appointments`
SET `duration_minutes` = GREATEST(TIMESTAMPDIFF(MINUTE, `start_time`, `end_time`), 1);

ALTER TABLE `appointments`
    MODIFY `duration_minutes` SMALLINT UNSIGNED NOT NULL,
    DROP COLUMN `end_time`,
    DROP COLUMN `price`;
