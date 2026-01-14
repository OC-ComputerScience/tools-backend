-- Migration script to remove userId column from sections table
-- Run this SQL script to update your database schema

-- Step 1: Drop the foreign key constraint if it exists
ALTER TABLE tools_db.sections DROP FOREIGN KEY IF EXISTS sections_ibfk_1;

-- Step 2: Drop the userId column
ALTER TABLE tools_db.sections DROP COLUMN IF EXISTS userId;

-- Verify the changes
-- SELECT * FROM tools_db.sections LIMIT 5;

