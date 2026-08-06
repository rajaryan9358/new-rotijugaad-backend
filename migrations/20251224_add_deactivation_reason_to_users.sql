-- Add deactivation_reason to users table (MySQL)
ALTER TABLE `users`
  ADD COLUMN `deactivation_reason` VARCHAR(255) NULL AFTER `is_active`;
