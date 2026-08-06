-- Add status_changed_by to employers table (tracks which admin changed verification status)
ALTER TABLE `employers`
  ADD COLUMN `status_changed_by` INT NULL DEFAULT NULL;
