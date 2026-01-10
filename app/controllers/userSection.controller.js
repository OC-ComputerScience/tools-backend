import db from "../models/index.js";
import logger from "../config/logger.js";
import multer from "multer";

const UserSection = db.userSection;
const User = db.user;
const Section = db.section;
const Op = db.Sequelize.Op;
const exports = {};

// Configure multer for CSV file upload (memory storage for CSV)
const csvUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: function (req, file, cb) {
    if (file.mimetype === "text/csv" || file.mimetype === "application/vnd.ms-excel" || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files are allowed"));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
}).single("file");

// Helper function to parse CSV line (handle quoted values)
const parseCSVLine = (line) => {
  const values = [];
  let currentValue = '';
  let inQuotes = false;
  
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(currentValue.trim());
      currentValue = '';
    } else {
      currentValue += char;
    }
  }
  values.push(currentValue.trim()); // Add last value
  return values;
};

// Create a new UserSection assignment
exports.create = async (req, res) => {
  try {
    const { userId, sectionId } = req.body;

    if (!userId || !sectionId) {
      logger.warn("UserSection creation attempt with missing required fields");
      return res.status(400).send({
        message: "userId and sectionId are required!",
      });
    }

    logger.debug(`Creating user-section assignment: userId=${userId}, sectionId=${sectionId}`);

    // Check if assignment already exists
    const existing = await UserSection.findOne({
      where: { userId, sectionId },
    });

    if (existing) {
      logger.warn(`User-section assignment already exists: userId=${userId}, sectionId=${sectionId}`);
      return res.status(400).send({
        message: "This user-section assignment already exists!",
      });
    }

    const userSection = await UserSection.create({ userId, sectionId });
    
    // Fetch with includes
    const result = await UserSection.findByPk(userSection.id, {
      include: [
        { model: User, as: "user", attributes: ["id", "fName", "lName", "email"] },
        { 
          model: Section, 
          as: "section", 
          attributes: ["id", "courseNumber", "courseSection", "courseDescription"],
          include: [
            { model: db.Semester, as: "semester", attributes: ["id", "name"] },
          ],
        },
      ],
    });

    logger.info(`User-section assignment created successfully: ${userSection.id}`);
    res.status(201).send(result);
  } catch (error) {
    logger.error(`Error creating user-section assignment: ${error.message}`);
    res.status(500).send({
      message: error.message || "Some error occurred while creating the user-section assignment.",
    });
  }
};

// Retrieve all UserSection assignments
exports.findAll = async (req, res) => {
  try {
    logger.debug("Fetching all user-section assignments");

    const userSections = await UserSection.findAll({
      include: [
        { model: User, as: "user", attributes: ["id", "fName", "lName", "email"] },
        { 
          model: Section, 
          as: "section", 
          attributes: ["id", "courseNumber", "courseSection", "courseDescription"],
          include: [
            { model: db.Semester, as: "semester", attributes: ["id", "name"] },
          ],
        },
      ],
      order: [
        ["userId", "ASC"],
        ["sectionId", "ASC"],
      ],
    });

    logger.info(`Retrieved ${userSections.length} user-section assignments`);
    res.send(userSections);
  } catch (error) {
    logger.error(`Error retrieving user-section assignments: ${error.message}`);
    res.status(500).send({
      message: error.message || "Some error occurred while retrieving user-section assignments.",
    });
  }
};

// Find all sections for a specific user
exports.findByUser = async (req, res) => {
  try {
    const userId = req.params.userId;
    logger.debug(`Finding sections for user: ${userId}`);

    const userSections = await UserSection.findAll({
      where: { userId },
      include: [
        { 
          model: Section, 
          as: "section", 
          attributes: ["id", "courseNumber", "courseSection", "courseDescription"],
          include: [
            { model: db.Semester, as: "semester", attributes: ["id", "name"] },
          ],
        },
      ],
      order: [["sectionId", "ASC"]],
    });

    logger.info(`Retrieved ${userSections.length} sections for user ${userId}`);
    res.send(userSections.map(us => us.section));
  } catch (error) {
    logger.error(`Error retrieving sections for user ${userId}: ${error.message}`);
    res.status(500).send({
      message: error.message || "Some error occurred while retrieving sections for the user.",
    });
  }
};

// Find all users for a specific section
exports.findBySection = async (req, res) => {
  try {
    const sectionId = req.params.sectionId;
    logger.debug(`Finding users for section: ${sectionId}`);

    const userSections = await UserSection.findAll({
      where: { sectionId },
      include: [
        { model: User, as: "user", attributes: ["id", "fName", "lName", "email"] },
      ],
      order: [["userId", "ASC"]],
    });

    logger.info(`Retrieved ${userSections.length} users for section ${sectionId}`);
    res.send(userSections.map(us => us.user));
  } catch (error) {
    logger.error(`Error retrieving users for section ${sectionId}: ${error.message}`);
    res.status(500).send({
      message: error.message || "Some error occurred while retrieving users for the section.",
    });
  }
};

// Delete a UserSection assignment
exports.delete = async (req, res) => {
  try {
    const id = req.params.id;
    logger.debug(`Attempting to delete user-section assignment: ${id}`);

    const num = await UserSection.destroy({
      where: { id: id },
    });

    if (num === 1) {
      logger.info(`User-section assignment ${id} deleted successfully`);
      res.send({
        message: "User-section assignment was deleted successfully!",
      });
    } else {
      logger.warn(`Cannot delete user-section assignment ${id} - not found`);
      res.send({
        message: `Cannot delete User-section assignment with id=${id}. Maybe it was not found!`,
      });
    }
  } catch (error) {
    logger.error(`Error deleting user-section assignment ${id}: ${error.message}`);
    res.status(500).send({
      message: "Could not delete User-section assignment with id=" + id,
    });
  }
};

// Delete a UserSection assignment by userId and sectionId
exports.deleteByUserAndSection = async (req, res) => {
  try {
    const { userId, sectionId } = req.params;
    logger.debug(`Attempting to delete user-section assignment: userId=${userId}, sectionId=${sectionId}`);

    const num = await UserSection.destroy({
      where: { userId, sectionId },
    });

    if (num === 1) {
      logger.info(`User-section assignment deleted successfully: userId=${userId}, sectionId=${sectionId}`);
      res.send({
        message: "User-section assignment was deleted successfully!",
      });
    } else {
      logger.warn(`Cannot delete user-section assignment - not found: userId=${userId}, sectionId=${sectionId}`);
      res.send({
        message: `Cannot delete User-section assignment. Maybe it was not found!`,
      });
    }
  } catch (error) {
    logger.error(`Error deleting user-section assignment: ${error.message}`);
    res.status(500).send({
      message: "Could not delete User-section assignment",
    });
  }
};

// Import user sections from CSV file
exports.importCSV = async (req, res) => {
  logger.debug("Starting CSV import for user sections");

  csvUpload(req, res, async function (err) {
    if (err instanceof multer.MulterError) {
      logger.error(`Multer error during CSV import: ${err.message}`);
      return res.status(400).json({ message: err.message });
    } else if (err) {
      logger.error(`Error during CSV import: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }

    if (!req.file) {
      logger.warn("No file uploaded for CSV import");
      return res.status(400).json({ message: "No file uploaded" });
    }

    try {
      // Parse CSV file
      const csvContent = req.file.buffer.toString('utf-8');
      const lines = csvContent.split('\n').filter(line => line.trim() !== '');
      
      if (lines.length < 2) {
        return res.status(400).json({ message: "CSV file must have at least a header row and one data row" });
      }

      // Parse header row
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      logger.debug(`CSV headers: ${headers.join(', ')}`);

      // Find column indices for required columns
      // Extra columns in the CSV file will be ignored
      const courseIdIndex = headers.findIndex(h => h === 'course_id');
      const userIdIndex = headers.findIndex(h => h === 'user_id');

      // Validate that all required columns exist
      // Note: Extra columns in CSV will be automatically ignored
      if (courseIdIndex === -1 || userIdIndex === -1) {
        return res.status(400).json({ 
          message: "CSV must contain columns: course_id, user_id. Extra columns will be ignored." 
        });
      }

      // Log any extra columns that will be ignored (optional - for debugging)
      const requiredColumns = ['course_id', 'user_id'];
      const extraColumns = headers.filter(h => !requiredColumns.includes(h));
      if (extraColumns.length > 0) {
        logger.debug(`Ignoring extra columns in CSV: ${extraColumns.join(', ')}`);
      }

      let addedCount = 0;
      const errors = [];

      // Process each data row
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        try {
          const values = parseCSVLine(line);

          const sectionCode = values[courseIdIndex] ? values[courseIdIndex].trim() : null;
          const userId = values[userIdIndex] ? parseInt(values[userIdIndex].trim()) : null;

          if (!sectionCode || !userId || isNaN(userId)) {
            errors.push(`Row ${i + 1}: Missing required fields (course_id or user_id)`);
            continue;
          }

          // Look up section by sectionCode to get sectionId
          const section = await Section.findOne({
            where: { sectionCode: sectionCode }
          });

          if (!section) {
            errors.push(`Row ${i + 1}: Section not found with sectionCode: ${sectionCode}`);
            continue;
          }

          // Check if user exists
          const user = await User.findByPk(userId);
          if (!user) {
            errors.push(`Row ${i + 1}: User not found with id: ${userId}`);
            continue;
          }

          // Create user section
          try {
            await UserSection.create({
              userId,
              sectionId: section.id,
              sectionCode,
            });
            addedCount++;
            logger.debug(`Added user-section: userId=${userId}, sectionId=${section.id}, sectionCode=${sectionCode}`);
          } catch (createErr) {
            // If duplicate key error, skip it
            if (createErr.name === 'SequelizeUniqueConstraintError' || 
                createErr.message.includes('Duplicate entry') ||
                createErr.message.includes('duplicate key')) {
              logger.debug(`Skipping duplicate user-section at row ${i + 1}: userId=${userId}, sectionId=${section.id}`);
              continue;
            }
            throw createErr;
          }
        } catch (rowErr) {
          logger.error(`Error processing row ${i + 1}: ${rowErr.message}`);
          errors.push(`Row ${i + 1}: ${rowErr.message}`);
        }
      }

      logger.info(`CSV import completed: ${addedCount} added, ${errors.length} errors`);
      
      res.status(200).json({
        message: "CSV import completed",
        added: addedCount,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error) {
      logger.error(`Error processing CSV import: ${error.message}`);
      res.status(500).json({
        message: error.message || "Error processing CSV file",
      });
    }
  });
};

export default exports;

