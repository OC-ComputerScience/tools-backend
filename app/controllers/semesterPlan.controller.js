import db from "../models/index.js";
import logger from "../config/logger.js";
import multer from "multer";

const SemesterPlan = db.semesterPlan;
const Major = db.major;
const Course = db.course;
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

// Create and Save a new SemesterPlan
exports.create = (req, res) => {
  if (!req.body.majorId || !req.body.semesterNumber || !req.body.courseId) {
    logger.warn("SemesterPlan creation attempt with missing required fields");
    res.status(400).send({
      message: "Major ID, semester number, and course ID are required!",
    });
    return;
  }

  const semesterPlan = {
    majorId: req.body.majorId,
    semesterNumber: req.body.semesterNumber,
    courseId: req.body.courseId,
  };

  logger.debug(
    `Creating semester plan: Major ${semesterPlan.majorId}, Semester ${semesterPlan.semesterNumber}, Course ${semesterPlan.courseId}`
  );

  SemesterPlan.create(semesterPlan)
    .then((data) => {
      logger.info(
        `SemesterPlan created successfully: ${data.id} - Major ${data.majorId}, Semester ${data.semesterNumber}`
      );
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error creating semester plan: ${err.message}`);
      res.status(500).send({
        message:
          err.message ||
          "Some error occurred while creating the SemesterPlan.",
      });
    });
};

// Retrieve all SemesterPlans from the database
exports.findAll = (req, res) => {
  const majorId = req.query.majorId;
  const semesterNumber = req.query.semesterNumber;

  let condition = {};
  if (majorId) condition.majorId = majorId;
  if (semesterNumber) condition.semesterNumber = semesterNumber;

  logger.debug(
    `Fetching semester plans with condition: ${JSON.stringify(condition)}`
  );

  SemesterPlan.findAll({
    where: condition,
    order: [
      ["majorId", "ASC"],
      ["semesterNumber", "ASC"],
      ["courseId", "ASC"],
    ],
    include: [
      { model: Major, as: "major" },
      { model: Course, as: "course" },
    ],
  })
    .then((data) => {
      logger.info(`Retrieved ${data.length} semester plans`);
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error retrieving semester plans: ${err.message}`);
      res.status(500).send({
        message:
          err.message || "Some error occurred while retrieving semester plans.",
      });
    });
};

// Find a single SemesterPlan with an id
exports.findOne = (req, res) => {
  const id = req.params.id;
  logger.debug(`Finding semester plan with id: ${id}`);

  SemesterPlan.findByPk(id, {
    include: [
      { model: Major, as: "major" },
      { model: Course, as: "course" },
    ],
  })
    .then((data) => {
      if (data) {
        logger.info(`SemesterPlan found: ${id}`);
        res.send(data);
      } else {
        logger.warn(`SemesterPlan not found with id: ${id}`);
        res.status(404).send({
          message: `Cannot find SemesterPlan with id=${id}.`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error retrieving semester plan ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error retrieving SemesterPlan with id=" + id,
      });
    });
};

// Update a SemesterPlan by the id in the request
exports.update = (req, res) => {
  const id = req.params.id;

  logger.debug(
    `Updating semester plan ${id} with data: ${JSON.stringify(req.body)}`
  );

  SemesterPlan.update(req.body, {
    where: { id: id },
  })
    .then((num) => {
      if (num == 1) {
        logger.info(`SemesterPlan ${id} updated successfully`);
        res.send({
          message: "SemesterPlan was updated successfully.",
        });
      } else {
        logger.warn(
          `Failed to update semester plan ${id} - not found or empty body`
        );
        res.send({
          message: `Cannot update SemesterPlan with id=${id}. Maybe SemesterPlan was not found or req.body is empty!`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error updating semester plan ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error updating SemesterPlan with id=" + id,
      });
    });
};

// Delete a SemesterPlan with the specified id in the request
exports.delete = (req, res) => {
  const id = req.params.id;

  logger.debug(`Attempting to delete semester plan: ${id}`);

  SemesterPlan.destroy({
    where: { id: id },
  })
    .then((num) => {
      if (num == 1) {
        logger.info(`SemesterPlan ${id} deleted successfully`);
        res.send({
          message: "SemesterPlan was deleted successfully!",
        });
      } else {
        logger.warn(`Cannot delete semester plan ${id} - not found`);
        res.send({
          message: `Cannot delete SemesterPlan with id=${id}. Maybe SemesterPlan was not found!`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error deleting semester plan ${id}: ${err.message}`);
      res.status(500).send({
        message: "Could not delete SemesterPlan with id=" + id,
      });
    });
};

// Import semester plans from CSV file
exports.importCSV = async (req, res) => {
  logger.debug("Starting CSV import for semester plans");

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
      const majorCodeIndex = headers.findIndex(h => h === 'major_code' || h === 'majorcode');
      const courseNumberIndex = headers.findIndex(h => h === 'course_number' || h === 'coursenumber');
      const semesterNumberIndex = headers.findIndex(h => h === 'semester_number' || h === 'semesternumber');

      // Validate that all required columns exist
      // Note: Extra columns in CSV will be automatically ignored
      if (majorCodeIndex === -1 || courseNumberIndex === -1 || semesterNumberIndex === -1) {
        return res.status(400).json({ 
          message: "CSV must contain columns: major_code, course_number, semester_number. Extra columns will be ignored." 
        });
      }

      // Log any extra columns that will be ignored (optional - for debugging)
      const requiredColumns = ['major_code', 'majorcode', 'course_number', 'coursenumber', 'semester_number', 'semesternumber'];
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

          const majorCode = values[majorCodeIndex] ? values[majorCodeIndex].trim() : null;
          const courseNumber = values[courseNumberIndex] ? values[courseNumberIndex].trim() : null;
          const semesterNumber = values[semesterNumberIndex] ? parseInt(values[semesterNumberIndex].trim()) : null;

          if (!majorCode || !courseNumber || !semesterNumber || isNaN(semesterNumber)) {
            errors.push(`Row ${i + 1}: Missing required fields (major_code, course_number, or semester_number)`);
            continue;
          }

          // Look up major by code
          const major = await Major.findOne({
            where: { code: majorCode }
          });

          if (!major) {
            errors.push(`Row ${i + 1}: Major not found with code: ${majorCode}`);
            continue;
          }

          // Look up course by courseNumber (stored in the number field)
          const course = await Course.findOne({
            where: {
              number: courseNumber
            }
          });

          if (!course) {
            errors.push(`Row ${i + 1}: Course not found with course_number: ${courseNumber}`);
            continue;
          }

          // Check for duplicate
          const existing = await SemesterPlan.findOne({
            where: {
              majorId: major.id,
              semesterNumber: semesterNumber,
              courseId: course.id
            }
          });

          if (existing) {
            logger.debug(`Skipping duplicate semester plan at row ${i + 1}: majorId=${major.id}, semesterNumber=${semesterNumber}, courseId=${course.id}`);
            continue;
          }

          // Create semester plan
          try {
            await SemesterPlan.create({
              majorId: major.id,
              semesterNumber: semesterNumber,
              courseId: course.id
            });
            addedCount++;
            logger.debug(`Added semester plan: majorId=${major.id}, semesterNumber=${semesterNumber}, courseId=${course.id}`);
          } catch (createErr) {
            // If duplicate key error, skip it
            if (createErr.name === 'SequelizeUniqueConstraintError' || 
                createErr.message.includes('Duplicate entry') ||
                createErr.message.includes('duplicate key')) {
              logger.debug(`Skipping duplicate semester plan at row ${i + 1}: majorId=${major.id}, semesterNumber=${semesterNumber}, courseId=${course.id}`);
              continue;
            }
            logger.error(`Error creating semester plan at row ${i + 1}:`, {
              error: createErr.message,
              stack: createErr.stack,
              majorId: major.id,
              semesterNumber,
              courseId: course.id
            });
            errors.push(`Row ${i + 1}: Error creating semester plan - ${createErr.message}`);
            continue;
          }
        } catch (rowErr) {
          logger.error(`Error processing row ${i + 1}:`, {
            error: rowErr.message,
            stack: rowErr.stack,
            line: lines[i]
          });
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
      logger.error(`Error processing CSV import:`, {
        error: error.message,
        stack: error.stack,
        fileName: req.file ? req.file.originalname : 'unknown'
      });
      res.status(500).json({
        message: error.message || "Error processing CSV file",
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });
};

export default exports;




