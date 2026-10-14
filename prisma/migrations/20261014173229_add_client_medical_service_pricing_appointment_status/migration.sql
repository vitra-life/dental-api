/*
  Warnings:

  - Added the required column `end_time` to the `appointments` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `appointments` ADD COLUMN `end_time` DATETIME(3) NOT NULL,
    ADD COLUMN `price` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN `status` ENUM('pending', 'confirmed', 'completed', 'cancelled', 'no_show') NOT NULL DEFAULT 'pending';

-- AlterTable
ALTER TABLE `clients` ADD COLUMN `allergies` TEXT NULL,
    ADD COLUMN `emergency_contact` VARCHAR(255) NULL,
    ADD COLUMN `emergency_phone` VARCHAR(11) NULL,
    ADD COLUMN `insurance_company` VARCHAR(255) NULL,
    ADD COLUMN `insurance_number` VARCHAR(50) NULL,
    ADD COLUMN `medical_history` TEXT NULL,
    ADD COLUMN `notes` TEXT NULL;

-- AlterTable
ALTER TABLE `services` ADD COLUMN `active` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `category` ENUM('general', 'endodontics', 'surgery', 'prosthodontics', 'cosmetic', 'orthodontics') NOT NULL DEFAULT 'general',
    ADD COLUMN `default_price` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN `description` TEXT NULL,
    ADD COLUMN `duration_minutes` SMALLINT UNSIGNED NOT NULL DEFAULT 30;
