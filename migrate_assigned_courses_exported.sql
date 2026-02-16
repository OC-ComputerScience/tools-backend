-- Migration script to add exported and exportedDate columns to assigned_courses table
-- Run this SQL script to update your database schema if the server auto-migration does not run

-- Add exported (boolean) and exportedDate (date) columns
ALTER TABLE assigned_courses
ADD COLUMN exported BOOLEAN DEFAULT FALSE,
ADD COLUMN exportedDate DATE NULL;

-- Add coursesExported (boolean) and coursesExportedDate (date) columns for Export Canvas Courses
ALTER TABLE assigned_courses
ADD COLUMN coursesExported BOOLEAN DEFAULT FALSE,
ADD COLUMN coursesExportedDate DATE NULL;
