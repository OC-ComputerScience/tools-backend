-- Migration script to rename user_courses to user_sections and change courseId to sectionId
-- Run this SQL script to update your database schema

-- Step 1: Rename the table
RENAME TABLE tools_db.user_courses TO tools_db.user_sections;

-- Step 2: Rename the column courseId to sectionId
ALTER TABLE tools_db.user_sections CHANGE COLUMN courseId sectionId INT NOT NULL;

-- Verify the changes
-- SELECT * FROM tools_db.user_sections LIMIT 5;

