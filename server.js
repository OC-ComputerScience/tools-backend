import routes from "./app/routes/index.js";
import express, { json, urlencoded } from "express"
import cors from "cors";
import morgan from "morgan";

import db  from "./app/models/index.js";
import logger from "./app/config/logger.js";

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

