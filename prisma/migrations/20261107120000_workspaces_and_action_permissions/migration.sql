-- CreateTable
CREATE TABLE `workspaces` (
    `id` CHAR(36) NOT NULL,
    `clinic_id` CHAR(36) NOT NULL,
    `membership_id` CHAR(36) NOT NULL,
    `kind` ENUM('doctor', 'staff', 'clinic') NOT NULL,
    `doctor_membership_id` CHAR(36) NULL,
    `relationship_type_id` CHAR(36) NULL,
    `is_admin` BOOLEAN NOT NULL DEFAULT false,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `workspaces_clinic_id_membership_id_idx`(`clinic_id`, `membership_id`),
    INDEX `workspaces_clinic_id_doctor_membership_id_idx`(`clinic_id`, `doctor_membership_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- CreateTable
CREATE TABLE `workspace_permissions` (
    `id` CHAR(36) NOT NULL,
    `clinic_id` CHAR(36) NOT NULL,
    `workspace_id` CHAR(36) NOT NULL,
    `permission_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `workspace_permissions_permission_id_idx`(`permission_id`),
    UNIQUE INDEX `workspace_permissions_workspace_id_permission_id_key`(`workspace_id`, `permission_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- CreateTable
CREATE TABLE `permission_templates` (
    `id` CHAR(36) NOT NULL,
    `clinic_id` CHAR(36) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `permission_templates_clinic_id_code_key`(`clinic_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- CreateTable
CREATE TABLE `permission_template_items` (
    `id` CHAR(36) NOT NULL,
    `template_id` CHAR(36) NOT NULL,
    `permission_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `permission_template_items_permission_id_idx`(`permission_id`),
    UNIQUE INDEX `permission_template_items_template_id_permission_id_key`(`template_id`, `permission_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- MoveData: today's admins, doctors and staff assignments become workspaces.
-- Only the clinic admin keeps its access (an admin workspace holds every
-- permission); every other workspace starts with no permissions.
INSERT INTO `workspaces` (`id`, `clinic_id`, `membership_id`, `kind`, `doctor_membership_id`, `relationship_type_id`, `is_admin`, `is_active`, `created_at`, `updated_at`)
SELECT UUID(), mr.`clinic_id`, mr.`membership_id`, 'clinic', NULL, NULL, true, true, NOW(3), NOW(3)
FROM `membership_roles` mr
JOIN `roles` r ON r.`id` = mr.`role_id`
WHERE r.`code` = 'clinic_admin' AND r.`is_system` = true;

INSERT INTO `workspaces` (`id`, `clinic_id`, `membership_id`, `kind`, `doctor_membership_id`, `relationship_type_id`, `is_admin`, `is_active`, `created_at`, `updated_at`)
SELECT UUID(), mst.`clinic_id`, mst.`membership_id`, 'doctor', mst.`membership_id`, NULL, false, true, NOW(3), NOW(3)
FROM `membership_staff_types` mst
JOIN `staff_types` st ON st.`id` = mst.`staff_type_id`
WHERE st.`code` = 'doctor';

INSERT INTO `workspaces` (`id`, `clinic_id`, `membership_id`, `kind`, `doctor_membership_id`, `relationship_type_id`, `is_admin`, `is_active`, `created_at`, `updated_at`)
SELECT UUID(), sa.`clinic_id`, sa.`staff_membership_id`, 'staff', sa.`doctor_membership_id`, sa.`relationship_type_id`, false, sa.`is_active`, NOW(3), NOW(3)
FROM `staff_assignments` sa;

-- MoveData: a clinic's custom roles become its permission templates. The seed
-- then moves their old codes onto the new per-action ones.
INSERT INTO `permission_templates` (`id`, `clinic_id`, `code`, `name`, `created_at`, `updated_at`)
SELECT `id`, `clinic_id`, `code`, `name`, `created_at`, `updated_at`
FROM `roles`
WHERE `is_system` = false AND `clinic_id` IS NOT NULL;

INSERT INTO `permission_template_items` (`id`, `template_id`, `permission_id`, `created_at`)
SELECT rp.`id`, rp.`role_id`, rp.`permission_id`, rp.`created_at`
FROM `role_permissions` rp
JOIN `roles` r ON r.`id` = rp.`role_id`
WHERE r.`is_system` = false AND r.`clinic_id` IS NOT NULL;

-- Sessions point at a clinic, not a workspace: everyone signs in again.
UPDATE `auth_sessions` SET `revoked_at` = NOW(3) WHERE `revoked_at` IS NULL;

-- DropIndex
DROP INDEX `clients_clinic_id_created_by_membership_id_idx` ON `clients`;


-- DropIndex
DROP INDEX `clients_clinic_id_phone_key` ON `clients`;


-- DropIndex
DROP INDEX `permissions_parent_code_idx` ON `permissions`;


-- AlterTable
ALTER TABLE `appointments` ADD COLUMN `created_by_workspace_id` CHAR(36) NULL,
    ADD COLUMN `deleted_at` DATETIME(3) NULL;


-- AlterTable
ALTER TABLE `auth_sessions` DROP COLUMN `active_clinic_id`,
    ADD COLUMN `active_workspace_id` CHAR(36) NULL;


-- AlterTable
ALTER TABLE `clients` ADD COLUMN `created_by_workspace_id` CHAR(36) NULL,
    ADD COLUMN `deleted_at` DATETIME(3) NULL;


-- AlterTable
ALTER TABLE `permissions` DROP COLUMN `kind`,
    DROP COLUMN `parent_code`,
    ADD COLUMN `group_code` VARCHAR(64) NULL;


-- DropTable
DROP TABLE `membership_roles`;


-- DropTable
DROP TABLE `role_permissions`;


-- DropTable
DROP TABLE `roles`;


-- DropTable
DROP TABLE `staff_assignments`;


-- CreateIndex
CREATE INDEX `appointments_clinic_id_deleted_at_idx` ON `appointments`(`clinic_id`, `deleted_at`);


-- CreateIndex
CREATE INDEX `clients_clinic_id_phone_idx` ON `clients`(`clinic_id`, `phone`);


-- CreateIndex
CREATE INDEX `clients_clinic_id_deleted_at_idx` ON `clients`(`clinic_id`, `deleted_at`);


-- CreateIndex
CREATE INDEX `clients_clinic_id_created_by_workspace_id_idx` ON `clients`(`clinic_id`, `created_by_workspace_id`);


-- CreateIndex
CREATE INDEX `permissions_group_code_idx` ON `permissions`(`group_code`);
