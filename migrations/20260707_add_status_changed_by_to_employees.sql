-- Add status_changed_by to employees table (tracks which admin changed verification status)
ALTER TABLE `employees`
  ADD COLUMN `status_changed_by` INT NULL DEFAULT NULL;
