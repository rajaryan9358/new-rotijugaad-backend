-- Add status_changed_by to jobs table (tracks which admin changed verification status)
ALTER TABLE `jobs`
  ADD COLUMN `status_changed_by` INT NULL DEFAULT NULL;
