import routes from "./app/routes/index.js";
import express, { json, urlencoded } from "express"
import cors from "cors";
import morgan from "morgan";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import db  from "./app/models/index.js";
import logger from "./app/config/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database sync moved to after app initialization (below)

const app = express();

// HTTP request logger middleware
app.use(morgan('combined', { stream: logger.stream }));

// Also use the cors middleware as backup
var corsOptions = {
  origin: "http://localhost:8081",
  credentials: true
}
app.use(cors(corsOptions));

// parse requests of content-type - application/json
app.use(express.json());
// parse requests of content-type - application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));

// Serve static files from data/transcripts directory
app.use("/tools/data/transcripts", express.static(join(__dirname, "data/transcripts")));
  
// Load the routes from the routes folder
app.use("/tools", routes); 

// set port, listen for requests
const PORT = process.env.PORT || 3200;
if (process.env.NODE_ENV !== "test") {
  // Sync database schema - this will create tables if they don't exist
  db.sequelize.sync()
    .then(() => {
      logger.info("Database synchronized successfully");
      // Try to add accountId column to sections table if it doesn't exist
      // Get the actual table name from the model (handles pluralization)
      const tableName = db.section.getTableName();
      return db.sequelize.query(`
        ALTER TABLE ${tableName}
        ADD COLUMN accountId VARCHAR(255) NULL
      `).catch((err) => {
        // If column already exists, that's fine - continue
        if (err.message && (
          err.message.includes("Duplicate column name") ||
          err.message.includes("Duplicate column") ||
          err.message.includes("already exists")
        )) {
          logger.info("accountId column already exists, skipping...");
          return Promise.resolve();
        }
        // If table doesn't exist, that's unexpected but log and continue
        if (err.message && err.message.includes("doesn't exist")) {
          logger.warn("Sections table doesn't exist - sync should have created it. Continuing...");
          return Promise.resolve();
        }
        // For other errors, log but don't fail
        logger.warn("Could not add accountId column:", err.message);
        return Promise.resolve();
      });
    })
    .then(() => {
      // Try to add hours column to courses table if it doesn't exist
      // Get the actual table name from the model (handles pluralization)
      const courseTableName = db.course.getTableName();
      return db.sequelize.query(`
        ALTER TABLE ${courseTableName}
        ADD COLUMN hours INT NULL
      `).catch((err) => {
        // If column already exists, that's fine - continue
        if (err.message && (
          err.message.includes("Duplicate column name") ||
          err.message.includes("Duplicate column") ||
          err.message.includes("already exists")
        )) {
          logger.info("hours column already exists, skipping...");
          return Promise.resolve();
        }
        // If table doesn't exist, that's unexpected but log and continue
        if (err.message && err.message.includes("doesn't exist")) {
          logger.warn("Courses table doesn't exist - sync should have created it. Continuing...");
          return Promise.resolve();
        }
        // For other errors, log but don't fail
        logger.warn("Could not add hours column:", err.message);
        return Promise.resolve();
      });
    })
    .then(() => {
      // Try to add courseId column to university_courses table if it doesn't exist
      // Get the actual table name from the model (handles pluralization)
      const universityCourseTableName = db.UniversityCourse.getTableName();
      return db.sequelize.query(`
        ALTER TABLE ${universityCourseTableName}
        ADD COLUMN courseId INT NULL
      `).catch((err) => {
        // If column already exists, that's fine - continue
        if (err.message && (
          err.message.includes("Duplicate column name") ||
          err.message.includes("Duplicate column") ||
          err.message.includes("already exists")
        )) {
          logger.info("courseId column already exists, skipping...");
          return Promise.resolve();
        }
        // If table doesn't exist, that's unexpected but log and continue
        if (err.message && err.message.includes("doesn't exist")) {
          logger.warn("University courses table doesn't exist - sync should have created it. Continuing...");
          return Promise.resolve();
        }
        // For other errors, log but don't fail
        logger.warn("Could not add courseId column:", err.message);
        return Promise.resolve();
      });
    })
    .then(() => {
      // Modify grade column in transcript_courses table to allow NULL
      const transcriptCourseTableName = db.TranscriptCourse.getTableName();
      return db.sequelize.query(`
        ALTER TABLE ${transcriptCourseTableName}
        MODIFY COLUMN grade VARCHAR(255) NULL
      `).catch((err) => {
        // If error is about column not existing or already nullable, that's fine
        if (err.message && (
          err.message.includes("doesn't exist") ||
          err.message.includes("Duplicate column") ||
          err.message.includes("already exists")
        )) {
          logger.info("Grade column modification skipped (may already be nullable)");
          return Promise.resolve();
        }
        logger.warn("Could not modify grade column:", err.message);
        return Promise.resolve();
      });
    })
    .then(() => {
      // Try to add sectionCode column to sections table if it doesn't exist
      const sectionTableName = db.section.getTableName();
      return db.sequelize.query(`
        ALTER TABLE ${sectionTableName}
        ADD COLUMN sectionCode VARCHAR(255) NULL
      `).catch((err) => {
        // If column already exists, that's fine - continue
        if (err.message && (
          err.message.includes("Duplicate column name") ||
          err.message.includes("Duplicate column") ||
          err.message.includes("already exists")
        )) {
          logger.info("sectionCode column already exists in sections table, skipping...");
          return Promise.resolve();
        }
        // If table doesn't exist, that's unexpected but log and continue
        if (err.message && err.message.includes("doesn't exist")) {
          logger.warn("Sections table doesn't exist - sync should have created it. Continuing...");
          return Promise.resolve();
        }
        // For other errors, log but don't fail
        logger.warn("Could not add sectionCode column to sections table:", err.message);
        return Promise.resolve();
      });
    })
    .then(() => {
      // Try to add sectionCode column to user_sections table if it doesn't exist
      const userSectionTableName = db.userSection.getTableName();
      return db.sequelize.query(`
        ALTER TABLE ${userSectionTableName}
        ADD COLUMN sectionCode VARCHAR(255) NULL
      `).catch((err) => {
        // If column already exists, that's fine - continue
        if (err.message && (
          err.message.includes("Duplicate column name") ||
          err.message.includes("Duplicate column") ||
          err.message.includes("already exists")
        )) {
          logger.info("sectionCode column already exists in user_sections table, skipping...");
          return Promise.resolve();
        }
        // If table doesn't exist, that's unexpected but log and continue
        if (err.message && err.message.includes("doesn't exist")) {
          logger.warn("User_sections table doesn't exist - sync should have created it. Continuing...");
          return Promise.resolve();
        }
        // For other errors, log but don't fail
        logger.warn("Could not add sectionCode column to user_sections table:", err.message);
        return Promise.resolve();
      });
    })
    .then(() => {
      // Try to add sectionCode column to meetingTime table if it doesn't exist
      const meetingTimeTableName = db.meetingTime.getTableName();
      return db.sequelize.query(`
        ALTER TABLE ${meetingTimeTableName}
        ADD COLUMN sectionCode VARCHAR(255) NULL
      `).catch((err) => {
        // If column already exists, that's fine - continue
        if (err.message && (
          err.message.includes("Duplicate column name") ||
          err.message.includes("Duplicate column") ||
          err.message.includes("already exists")
        )) {
          logger.info("sectionCode column already exists in meetingTime table, skipping...");
          return Promise.resolve();
        }
        // If table doesn't exist, that's unexpected but log and continue
        if (err.message && err.message.includes("doesn't exist")) {
          logger.warn("MeetingTime table doesn't exist - sync should have created it. Continuing...");
          return Promise.resolve();
        }
        // For other errors, log but don't fail
        logger.warn("Could not add sectionCode column to meetingTime table:", err.message);
        return Promise.resolve();
      });
    })
    .then(() => {
      // Try to add status column to university_transcripts table if it doesn't exist
      const universityTranscriptTableName = db.UniversityTranscript.getTableName();
      return db.sequelize.query(`
        ALTER TABLE ${universityTranscriptTableName}
        ADD COLUMN status VARCHAR(255) DEFAULT 'Not Process'
      `).catch((err) => {
        // If column already exists, that's fine - continue
        if (err.message && (
          err.message.includes("Duplicate column name") ||
          err.message.includes("Duplicate column") ||
          err.message.includes("already exists")
        )) {
          logger.info("status column already exists in university_transcripts table, skipping...");
          return Promise.resolve();
        }
        // If table doesn't exist, that's unexpected but log and continue
        if (err.message && err.message.includes("doesn't exist")) {
          logger.warn("University_transcripts table doesn't exist - sync should have created it. Continuing...");
          return Promise.resolve();
        }
        // For other errors, log but don't fail
        logger.warn("Could not add status column to university_transcripts table:", err.message);
        return Promise.resolve();
      });
    })
    .then(() => {
      // Try to add notAssignmentNeeded column to assigned_courses table and make assignedSectionId nullable
      const assignedCourseTableName = db.assignedCourse.getTableName();
      return db.sequelize.query(`
        ALTER TABLE ${assignedCourseTableName}
        ADD COLUMN notAssignmentNeeded BOOLEAN DEFAULT FALSE,
        MODIFY COLUMN assignedSectionId INT NULL
      `).catch((err) => {
        // If column already exists, that's fine - continue
        if (err.message && (
          err.message.includes("Duplicate column name") ||
          err.message.includes("Duplicate column") ||
          err.message.includes("already exists")
        )) {
          logger.info("notAssignmentNeeded column already exists in assigned_courses table, skipping...");
          // Try to modify assignedSectionId to be nullable if not already
          return db.sequelize.query(`
            ALTER TABLE ${assignedCourseTableName}
            MODIFY COLUMN assignedSectionId INT NULL
          `).catch((modifyErr) => {
            if (modifyErr.message && (
              modifyErr.message.includes("doesn't exist") ||
              modifyErr.message.includes("Duplicate")
            )) {
              logger.info("assignedSectionId column modification skipped (may already be nullable)");
              return Promise.resolve();
            }
            logger.warn("Could not modify assignedSectionId column:", modifyErr.message);
            return Promise.resolve();
          });
        }
        // If table doesn't exist, that's unexpected but log and continue
        if (err.message && err.message.includes("doesn't exist")) {
          logger.warn("Assigned_courses table doesn't exist - sync should have created it. Continuing...");
          return Promise.resolve();
        }
        // For other errors, log but don't fail
        logger.warn("Could not add notAssignmentNeeded column to assigned_courses table:", err.message);
        return Promise.resolve();
      });
    })
    .then(() => {
      app.listen(PORT, () => {
        logger.info(`Server is running on port ${PORT}`);
      });
    })
    .catch((err) => {
      logger.error("Unable to synchronize database:", err);
      // Try to start server anyway - sync() should have created tables
      logger.warn("Attempting to start server despite sync warning...");
      app.listen(PORT, () => {
        logger.info(`Server is running on port ${PORT}`);
      });
    });
}

// Export logger for use in other modules
export { logger };

export default app;

