-- Real Estate Lead & Inventory Manager - MySQL Schema
-- Timezone: Asia/Kolkata (+05:30)
-- Compatible with MySQL 5.7+ / MySQL 8.0+ / MariaDB 10.3+ (InfinityFree Hosting)

SET NAMES utf8mb4;
SET time_zone = '+05:30';

CREATE TABLE IF NOT EXISTS `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(150) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('admin', 'agent') NOT NULL DEFAULT 'admin',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_sessions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_sessions_token_hash` (`token_hash`),
  KEY `idx_user_sessions_expires_at` (`expires_at`),
  CONSTRAINT `fk_user_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tag_master` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(60) NOT NULL,
  `description` TEXT NULL,
  `color` VARCHAR(20) NOT NULL DEFAULT '#2563eb',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tag_master_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `inventory` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `unique_code` VARCHAR(60) NOT NULL COMMENT 'Unique identifier to distinguish inventory (e.g. T1-410C, INV-322B)',
  `unit_number` VARCHAR(60) NOT NULL COMMENT 'Unit / Flat / Shop number (e.g. 410 C, 322 B)',
  `title` VARCHAR(150) NOT NULL COMMENT 'Project / Building / Property Name',
  `property_type` VARCHAR(60) NOT NULL DEFAULT 'Apartment',
  `location` VARCHAR(180) NULL,
  `floor_wing` VARCHAR(80) NULL,
  `area_sqft` DECIMAL(12,2) NULL,
  `price` DECIMAL(15,2) NULL,
  `tag_id` INT UNSIGNED NULL,
  `notes` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_inventory_unique_code` (`unique_code`),
  KEY `idx_inventory_unit_number` (`unit_number`),
  KEY `idx_inventory_tag_id` (`tag_id`),
  CONSTRAINT `fk_inventory_tag` FOREIGN KEY (`tag_id`) REFERENCES `tag_master` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `leads` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `full_name` VARCHAR(120) NOT NULL,
  `phone` VARCHAR(30) NOT NULL,
  `email` VARCHAR(150) NULL,
  `source` VARCHAR(80) NULL,
  `budget_min` DECIMAL(15,2) NULL,
  `budget_max` DECIMAL(15,2) NULL,
  `preferred_location` VARCHAR(180) NULL,
  `property_requirement` VARCHAR(120) NULL,
  `interested_inventory_id` INT UNSIGNED NULL,
  `is_visited` TINYINT(1) NOT NULL DEFAULT 0,
  `visited_at` DATETIME NULL,
  `needs_followup` TINYINT(1) NOT NULL DEFAULT 1,
  `next_followup_at` DATETIME NULL,
  `status` ENUM('New', 'Contacted', 'Visited', 'Negotiation', 'Closed Won', 'Closed Lost') NOT NULL DEFAULT 'New',
  `notes` TEXT NULL,
  `reminder_sent_for` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_leads_phone` (`phone`),
  KEY `idx_leads_status` (`status`),
  KEY `idx_leads_next_followup` (`needs_followup`, `next_followup_at`),
  KEY `idx_leads_visited` (`is_visited`),
  CONSTRAINT `fk_leads_inventory` FOREIGN KEY (`interested_inventory_id`) REFERENCES `inventory` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lead_followups` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `lead_id` INT UNSIGNED NOT NULL,
  `followup_at` DATETIME NOT NULL,
  `channel` ENUM('Call', 'WhatsApp', 'Email', 'Site Visit', 'Meeting', 'Other') NOT NULL DEFAULT 'Call',
  `outcome` VARCHAR(150) NULL,
  `notes` TEXT NOT NULL,
  `next_followup_at` DATETIME NULL,
  `marked_visited` TINYINT(1) NOT NULL DEFAULT 0,
  `created_by` INT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_lead_followups_lead_id` (`lead_id`),
  KEY `idx_lead_followups_followup_at` (`followup_at`),
  CONSTRAINT `fk_lead_followups_lead` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lead_followups_user` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `email_settings` (
  `id` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `reminders_enabled` TINYINT(1) NOT NULL DEFAULT 0,
  `recipient_email` TEXT NOT NULL,
  `sender_name` VARCHAR(100) NOT NULL DEFAULT 'Property Lead Manager',
  `sender_email` VARCHAR(150) NOT NULL DEFAULT '',
  `transport` ENUM('smtp', 'php_mail', 'resend_api', 'brevo_api') NOT NULL DEFAULT 'brevo_api',
  `smtp_host` VARCHAR(150) NULL,
  `smtp_port` INT UNSIGNED NOT NULL DEFAULT 587,
  `smtp_encryption` ENUM('tls', 'ssl', 'none') NOT NULL DEFAULT 'tls',
  `smtp_username` VARCHAR(150) NULL,
  `smtp_password_enc` TEXT NULL,
  `api_key_enc` TEXT NULL,
  `remind_before_minutes` INT UNSIGNED NOT NULL DEFAULT 60,
  `cron_secret` VARCHAR(80) NOT NULL,
  `last_run_at` DATETIME NULL,
  `last_status` VARCHAR(255) NULL,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `reminder_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `lead_id` INT UNSIGNED NULL,
  `recipient_email` TEXT NOT NULL,
  `subject` VARCHAR(200) NOT NULL,
  `status` ENUM('sent', 'failed') NOT NULL,
  `error_message` TEXT NULL,
  `sent_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_reminder_logs_sent_at` (`sent_at`),
  CONSTRAINT `fk_reminder_logs_lead` FOREIGN KEY (`lead_id`) REFERENCES `leads` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default Tag Master entries
INSERT IGNORE INTO `tag_master` (`name`, `description`, `color`, `is_active`) VALUES
  ('For Sale', 'Property available for outright sale', '#16a34a', 1),
  ('For Rent', 'Property available for rent or lease', '#2563eb', 1),
  ('Sold', 'Property has been sold and is no longer available', '#dc2626', 1),
  ('Rented', 'Property is currently leased / rented out', '#9333ea', 1),
  ('Reserved', 'Token or booking amount received; temporarily on hold', '#d97706', 1);

