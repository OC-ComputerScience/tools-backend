-- Migration script to add sectionCode column to sections, user_sections, and meetingTime tables
-- Run this SQL script to update your database schema

-- Step 1: Add sectionCode to sections table
ALTER TABLE tools_db.sections 
ADD COLUMN sectionCode VARCHAR(255) NULL;

-- Step 2: Add sectionCode to user_sections table
ALTER TABLE tools_db.user_sections 
ADD COLUMN sectionCode VARCHAR(255) NULL;

-- Step 3: Add sectionCode to meetingTime table
ALTER TABLE tools_db.meetingTime 
ADD COLUMN sectionCode VARCHAR(255) NULL;

-- Verify the changes
-- SELECT * FROM tools_db.sections LIMIT 5;
-- SELECT * FROM tools_db.user_sections LIMIT 5;
-- SELECT * FROM tools_db.meetingTime LIMIT 5;

