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
      const sectionTableName = db.section.getTableName();
      return db.sequelize.query(`
        ALTER TABLE ${sectionTableName}
        ADD COLUMN canvasSISCourseID VARCHAR(255) NULL
      `).catch((err) => {
        if (err.message && (
          err.message.includes("Duplicate column name") ||
          err.message.includes("Duplicate column") ||
          err.message.includes("already exists")
        )) {
          logger.info("canvasSISCourseID column already exists on sections, skipping...");
          return Promise.resolve();
        }
        if (err.message && err.message.includes("doesn't exist")) {
          logger.warn("Sections table doesn't exist - sync should have created it. Continuing...");
          return Promise.resolve();
        }
        logger.warn("Could not add canvasSISCourseID column to sections:", err.message);
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
      // Try to add permanentAssignment column to transcript_courses table if it doesn't exist
      const transcriptCourseTableName = db.TranscriptCourse.getTableName();
      return db.sequelize.query(`
        ALTER TABLE ${transcriptCourseTableName}
        ADD COLUMN permanentAssignment BOOLEAN DEFAULT FALSE
      `).catch((err) => {
        // If column already exists, that's fine - continue
        if (err.message && (
          err.message.includes("Duplicate column name") ||
          err.message.includes("Duplicate column") ||
          err.message.includes("already exists")
        )) {
          logger.info("permanentAssignment column already exists in transcript_courses table, skipping...");
          return Promise.resolve();
        }
        // If table doesn't exist, that's unexpected but log and continue
        if (err.message && err.message.includes("doesn't exist")) {
          logger.warn("Transcript_courses table doesn't exist - sync should have created it. Continuing...");
          return Promise.resolve();
        }
        // For other errors, log but don't fail
        logger.warn("Could not add permanentAssignment column to transcript_courses table:", err.message);
        return Promise.resolve();
      });
    })
    .then(() => {
      // Modify semesterId column in transcript_courses table to allow NULL
      const transcriptCourseTableName = db.TranscriptCourse.getTableName();
      return db.sequelize.query(`
        ALTER TABLE ${transcriptCourseTableName}
        MODIFY COLUMN semesterId INT NULL
      `).catch((err) => {
        if (err.message && (
          err.message.includes("doesn't exist") ||
          err.message.includes("Duplicate") ||
          err.message.includes("already nullable") || // MySQL specific message if already nullable
          err.message.includes("already exists")
        )) {
          logger.info("semesterId column modification skipped (may already be nullable)");
          return Promise.resolve();
        }
        logger.warn("Could not modify semesterId column:", err.message);
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
      // Try to add exported and exportedDate columns to assigned_courses table
      const assignedCourseTableName = db.assignedCourse.getTableName();
      return db.sequelize.query(`
        ALTER TABLE ${assignedCourseTableName}
        ADD COLUMN exported BOOLEAN DEFAULT FALSE,
        ADD COLUMN exportedDate DATE NULL
      `).catch((err) => {
        if (err.message && (
          err.message.includes("Duplicate column name") ||
          err.message.includes("Duplicate column") ||
          err.message.includes("already exists")
        )) {
          logger.info("exported/exportedDate columns already exist in assigned_courses table, skipping...");
          return Promise.resolve();
        }
        if (err.message && err.message.includes("doesn't exist")) {
          logger.warn("Assigned_courses table doesn't exist - sync should have created it. Continuing...");
          return Promise.resolve();
        }
        logger.warn("Could not add exported/exportedDate columns to assigned_courses table:", err.message);
        return Promise.resolve();
      });
    })
    .then(() => {
      // Try to add coursesExported and coursesExportedDate columns to assigned_courses table
      const assignedCourseTableName = db.assignedCourse.getTableName();
      return db.sequelize.query(`
        ALTER TABLE ${assignedCourseTableName}
        ADD COLUMN coursesExported BOOLEAN DEFAULT FALSE,
        ADD COLUMN coursesExportedDate DATE NULL
      `).catch((err) => {
        if (err.message && (
          err.message.includes("Duplicate column name") ||
          err.message.includes("Duplicate column") ||
          err.message.includes("already exists")
        )) {
          logger.info("coursesExported/coursesExportedDate columns already exist in assigned_courses table, skipping...");
          return Promise.resolve();
        }
        if (err.message && err.message.includes("doesn't exist")) {
          logger.warn("Assigned_courses table doesn't exist - sync should have created it. Continuing...");
          return Promise.resolve();
        }
        logger.warn("Could not add coursesExported/coursesExportedDate columns to assigned_courses table:", err.message);
        return Promise.resolve();
      });
    })
    .then(() => {
      const departmentOutcomeTableName = db.DepartmentOutcome.getTableName();
      return db.sequelize.query(`
        ALTER TABLE ${departmentOutcomeTableName}
        ADD COLUMN universityOutcomeId INT NULL
      `).catch((err) => {
        if (err.message && (
          err.message.includes("Duplicate column name") ||
          err.message.includes("Duplicate column") ||
          err.message.includes("already exists")
        )) {
          logger.info("universityOutcomeId column already exists in department_outcomes table, skipping...");
          return Promise.resolve();
        }
        if (err.message && err.message.includes("doesn't exist")) {
          logger.warn("department_outcomes table doesn't exist - sync should have created it. Continuing...");
          return Promise.resolve();
        }
        logger.warn("Could not add universityOutcomeId column to department_outcomes table:", err.message);
        return Promise.resolve();
      });
    })
    .then(() => {
      const addLevel = (tableName) => db.sequelize.query(`
        ALTER TABLE ${tableName}
        ADD COLUMN level ENUM('undergraduate', 'graduate') NOT NULL DEFAULT 'undergraduate'
      `).catch((err) => {
        if (err.message && (
          err.message.includes("Duplicate column name") ||
          err.message.includes("Duplicate column") ||
          err.message.includes("already exists")
        )) {
          logger.info(`level column already exists in ${tableName}, skipping...`);
          return Promise.resolve();
        }
        if (err.message && err.message.includes("doesn't exist")) {
          logger.warn(`${tableName} doesn't exist - sync should have created it. Continuing...`);
          return Promise.resolve();
        }
        logger.warn(`Could not add level column to ${tableName}:`, err.message);
        return Promise.resolve();
      });
      return addLevel(db.UniversityOutcome.getTableName())
        .then(() => addLevel(db.DepartmentOutcome.getTableName()));
    })
    .then(() => {
      const addDateColumn = (tableName, columnName) => db.sequelize.query(`
        ALTER TABLE ${tableName}
        ADD COLUMN ${columnName} DATE NULL
      `).catch((err) => {
        if (err.message && (
          err.message.includes("Duplicate column name") ||
          err.message.includes("Duplicate column") ||
          err.message.includes("already exists")
        )) {
          logger.info(`${columnName} column already exists in ${tableName}, skipping...`);
          return Promise.resolve();
        }
        if (err.message && err.message.includes("doesn't exist")) {
          logger.warn(`${tableName} doesn't exist - sync should have created it. Continuing...`);
          return Promise.resolve();
        }
        logger.warn(`Could not add ${columnName} column to ${tableName}:`, err.message);
        return Promise.resolve();
      });
      const tables = [
        db.UniversityOutcome.getTableName(),
        db.DepartmentOutcome.getTableName(),
      ];
      return tables.reduce(
        (chain, tableName) =>
          chain
            .then(() => addDateColumn(tableName, "effectiveDate"))
            .then(() => addDateColumn(tableName, "endDate")),
        Promise.resolve()
      );
    })
    .then(() => {
      const departmentOutcomeTableName = db.DepartmentOutcome.getTableName();
      return db.sequelize.query(`
        ALTER TABLE ${departmentOutcomeTableName}
        DROP COLUMN status
      `).catch((err) => {
        if (err.message && (
          err.message.includes("check that column/key exists") ||
          err.message.includes("Can't DROP") ||
          err.message.includes("doesn't exist") ||
          err.message.includes("Unknown column")
        )) {
          logger.info("status column is not on department_outcomes, skipping...");
          return Promise.resolve();
        }
        logger.warn("Could not drop status column from department_outcomes:", err.message);
        return Promise.resolve();
      });
    })
    .then(() => {
      const semesterTableName = db.Semester.getTableName();
      return db.sequelize.query(`
        ALTER TABLE ${semesterTableName}
        ADD COLUMN canvasTermId INT NULL
      `).catch((err) => {
        if (err.message && (
          err.message.includes("Duplicate column name") ||
          err.message.includes("Duplicate column") ||
          err.message.includes("already exists")
        )) {
          logger.info("canvasTermId column already exists on semesters, skipping...");
          return Promise.resolve();
        }
        logger.warn("Could not add canvasTermId column to semesters:", err.message);
        return Promise.resolve();
      });
    })
    .then(async () => {
      const assignmentTableName = db.Assignment.getTableName();
      const courseTableName = db.course.getTableName();
      const [foreignKeys] = await db.sequelize.query(`
        SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = '${assignmentTableName}'
          AND COLUMN_NAME = 'courseId'
          AND REFERENCED_TABLE_NAME IS NOT NULL
      `);
      const courseForeignKey = foreignKeys[0];
      if (courseForeignKey?.REFERENCED_TABLE_NAME === courseTableName) {
        logger.info("assignments.courseId already references courses, skipping...");
        return;
      }
      if (courseForeignKey?.CONSTRAINT_NAME) {
        await db.sequelize.query(`
          ALTER TABLE ${assignmentTableName}
          DROP FOREIGN KEY ${courseForeignKey.CONSTRAINT_NAME}
        `);
      }
      await db.sequelize.query(`
        ALTER TABLE ${assignmentTableName}
        ADD CONSTRAINT assignments_courseId_courses_fk
        FOREIGN KEY (courseId) REFERENCES ${courseTableName}(id)
      `);
      logger.info("assignments.courseId now references courses");
    })
    .then(async () => {
      const departmentOutcomeTable = db.DepartmentOutcome.getTableName();
      const joinTable = db.DepartmentOutcomeUniversityOutcome.getTableName();
      const [columns] = await db.sequelize.query(`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = '${departmentOutcomeTable}'
          AND COLUMN_NAME = 'universityOutcomeId'
      `);
      if (!columns.length) {
        logger.info("department outcomes already use multiple university outcomes, skipping...");
        return;
      }

      await db.sequelize.query(`
        INSERT INTO ${joinTable} (departmentOutcomeId, universityOutcomeId, createdAt, updatedAt)
        SELECT d.id, d.universityOutcomeId, NOW(), NOW()
        FROM ${departmentOutcomeTable} d
        WHERE d.universityOutcomeId IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM ${joinTable} j
            WHERE j.departmentOutcomeId = d.id
              AND j.universityOutcomeId = d.universityOutcomeId
          )
      `);

      const [foreignKeys] = await db.sequelize.query(`
        SELECT CONSTRAINT_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = '${departmentOutcomeTable}'
          AND COLUMN_NAME = 'universityOutcomeId'
          AND REFERENCED_TABLE_NAME IS NOT NULL
      `);
      for (const foreignKey of foreignKeys) {
        await db.sequelize.query(`
          ALTER TABLE ${departmentOutcomeTable}
          DROP FOREIGN KEY ${foreignKey.CONSTRAINT_NAME}
        `);
      }
      await db.sequelize.query(`
        ALTER TABLE ${departmentOutcomeTable}
        DROP COLUMN universityOutcomeId
      `);
      logger.info("Department outcomes can now be assigned to multiple university outcomes");
    })
    .then(() => {
      const assignmentTableName = db.Assignment.getTableName();
      return db.sequelize.query(`
        ALTER TABLE ${assignmentTableName}
        ADD COLUMN totalPoints DECIMAL(8,2) NULL
      `).catch((err) => {
        if (err.message && (
          err.message.includes("Duplicate column name") ||
          err.message.includes("Duplicate column") ||
          err.message.includes("already exists")
        )) {
          logger.info("totalPoints column already exists on assignments, skipping...");
          return Promise.resolve();
        }
        logger.warn("Could not add totalPoints column to assignments:", err.message);
        return Promise.resolve();
      });
    })
    .then(() => {
      const assessmentScoreTableName = db.AssessmentScore.getTableName();
      return db.sequelize.query(`
        ALTER TABLE ${assessmentScoreTableName}
        ADD COLUMN description VARCHAR(255) NULL
      `).catch((err) => {
        if (err.message && (
          err.message.includes("Duplicate column name") ||
          err.message.includes("Duplicate column") ||
          err.message.includes("already exists")
        )) {
          logger.info("description column already exists on assessment_scores, skipping...");
          return Promise.resolve();
        }
        logger.warn("Could not add description column to assessment_scores:", err.message);
        return Promise.resolve();
      });
    })
    .then(() => {
      const departmentTableName = db.Department.getTableName();
      return db.sequelize.query(`
        ALTER TABLE ${departmentTableName}
        ADD COLUMN collegeId INTEGER NULL
      `).catch((err) => {
        if (err.message && (
          err.message.includes("Duplicate column name") ||
          err.message.includes("Duplicate column") ||
          err.message.includes("already exists")
        )) {
          logger.info("collegeId column already exists on departments, skipping...");
          return Promise.resolve();
        }
        logger.warn("Could not add collegeId column to departments:", err.message);
        return Promise.resolve();
      });
    })
    .then(() => {
      const universityTableName = db.University.getTableName();
      return db.sequelize.query(`
        ALTER TABLE ${universityTableName}
        ADD COLUMN provostUserId INTEGER NULL
      `).catch((err) => {
        if (err.message && (
          err.message.includes("Duplicate column name") ||
          err.message.includes("Duplicate column") ||
          err.message.includes("already exists")
        )) {
          logger.info("provostUserId column already exists on universities, skipping...");
          return Promise.resolve();
        }
        logger.warn("Could not add provostUserId column to universities:", err.message);
        return Promise.resolve();
      });
    })
    .then(() => {
      const assignmentTableName = db.Assignment.getTableName();
      return db.sequelize.query(`
        ALTER TABLE ${assignmentTableName}
        ADD COLUMN coreAssessment BOOLEAN NOT NULL DEFAULT FALSE
      `).catch((err) => {
        if (err.message && (
          err.message.includes("Duplicate column name") ||
          err.message.includes("Duplicate column") ||
          err.message.includes("already exists")
        )) {
          logger.info("coreAssessment column already exists on assignments, skipping...");
          return Promise.resolve();
        }
        logger.warn("Could not add coreAssessment column to assignments:", err.message);
        return Promise.resolve();
      });
    })
    .then(() => {
      const assignmentTableName = db.Assignment.getTableName();
      return db.sequelize.query(`
        ALTER TABLE ${assignmentTableName}
        ADD COLUMN universityOutcomeId INTEGER NULL
      `).catch((err) => {
        if (err.message && (
          err.message.includes("Duplicate column name") ||
          err.message.includes("Duplicate column") ||
          err.message.includes("already exists")
        )) {
          logger.info("universityOutcomeId column already exists on assignments, skipping...");
          return Promise.resolve();
        }
        logger.warn("Could not add universityOutcomeId column to assignments:", err.message);
        return Promise.resolve();
      });
    })
    .then(() => {
      const departmentTableName = db.Department.getTableName();
      return db.sequelize.query(`
        ALTER TABLE ${departmentTableName}
        ADD COLUMN assessmentWeight INTEGER NULL
      `).catch((err) => {
        if (err.message && (
          err.message.includes("Duplicate column name") ||
          err.message.includes("Duplicate column") ||
          err.message.includes("already exists")
        )) {
          logger.info("assessmentWeight column already exists on departments, skipping...");
          return Promise.resolve();
        }
        logger.warn("Could not add assessmentWeight column to departments:", err.message);
        return Promise.resolve();
      });
    })
    .then(() => {
      const collegeTableName = db.College.getTableName();
      return db.sequelize.query(`
        ALTER TABLE ${collegeTableName}
        ADD COLUMN assessmentWeight INTEGER NULL
      `).catch((err) => {
        if (err.message && (
          err.message.includes("Duplicate column name") ||
          err.message.includes("Duplicate column") ||
          err.message.includes("already exists")
        )) {
          logger.info("assessmentWeight column already exists on colleges, skipping...");
          return Promise.resolve();
        }
        logger.warn("Could not add assessmentWeight column to colleges:", err.message);
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

