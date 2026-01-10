import db from "../models/index.js";
import logger from "../config/logger.js";
import multer from "multer";

const MeetingTime = db.meetingTime;
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

// Create and Save a new MeetingTime
exports.create = (req, res) => {
  if (!req.body.sectionId || !req.body.startTime || !req.body.endTime) {
    logger.warn("MeetingTime creation attempt with missing required fields");
    res.status(400).send({
      message: "Section ID, start time, and end time are required!",
    });
    return;
  }

  const meetingTime = {
    sectionId: req.body.sectionId,
    monday: req.body.monday || false,
    tuesday: req.body.tuesday || false,
    wednesday: req.body.wednesday || false,
    thursday: req.body.thursday || false,
    friday: req.body.friday || false,
    saturday: req.body.saturday || false,
    sunday: req.body.sunday || false,
    startTime: req.body.startTime,
    endTime: req.body.endTime,
  };

  logger.debug(`Creating meeting time for section: ${meetingTime.sectionId}`);

  MeetingTime.create(meetingTime)
    .then((data) => {
      logger.info(`MeetingTime created successfully: ${data.id}`);
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error creating meeting time: ${err.message}`);
      res.status(500).send({
        message:
          err.message ||
          "Some error occurred while creating the MeetingTime.",
      });
    });
};

// Retrieve all MeetingTimes from the database
exports.findAll = (req, res) => {
  const sectionId = req.query.sectionId;

  let condition = sectionId ? { sectionId: sectionId } : {};

  logger.debug(
    `Fetching meeting times with condition: ${JSON.stringify(condition)}`
  );

  MeetingTime.findAll({
    where: condition,
    include: [{ model: Section, as: "section" }],
    order: [["startTime", "ASC"]],
  })
    .then((data) => {
      logger.info(`Retrieved ${data.length} meeting times`);
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error retrieving meeting times: ${err.message}`);
      res.status(500).send({
        message:
          err.message ||
          "Some error occurred while retrieving meeting times.",
      });
    });
};

// Find a single MeetingTime with an id
exports.findOne = (req, res) => {
  const id = req.params.id;
  logger.debug(`Finding meeting time with id: ${id}`);

  MeetingTime.findByPk(id, {
    include: [{ model: Section, as: "section" }],
  })
    .then((data) => {
      if (data) {
        logger.info(`MeetingTime found: ${id}`);
        res.send(data);
      } else {
        logger.warn(`MeetingTime not found with id: ${id}`);
        res.status(404).send({
          message: `Cannot find MeetingTime with id=${id}.`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error retrieving meeting time ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error retrieving MeetingTime with id=" + id,
      });
    });
};

// Find all meeting times for a specific section
exports.findBySectionId = (req, res) => {
  const sectionId = req.params.sectionId;
  logger.debug(`Finding meeting times for sectionId: ${sectionId}`);

  MeetingTime.findAll({
    where: { sectionId: sectionId },
    include: [{ model: Section, as: "section" }],
    order: [["startTime", "ASC"]],
  })
    .then((data) => {
      logger.info(`Retrieved ${data.length} meeting times for section: ${sectionId}`);
      res.send(data);
    })
    .catch((err) => {
      logger.error(
        `Error retrieving meeting times for section ${sectionId}: ${err.message}`
      );
      res.status(500).send({
        message: "Error retrieving MeetingTimes for section=" + sectionId,
      });
    });
};

// Update a MeetingTime by the id in the request
exports.update = (req, res) => {
  const id = req.params.id;

  logger.debug(
    `Updating meeting time ${id} with data: ${JSON.stringify(req.body)}`
  );

  MeetingTime.update(req.body, {
    where: { id: id },
  })
    .then((num) => {
      if (num == 1) {
        logger.info(`MeetingTime ${id} updated successfully`);
        res.send({
          message: "MeetingTime was updated successfully.",
        });
      } else {
        logger.warn(
          `Failed to update meeting time ${id} - not found or empty body`
        );
        res.send({
          message: `Cannot update MeetingTime with id=${id}. Maybe MeetingTime was not found or req.body is empty!`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error updating meeting time ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error updating MeetingTime with id=" + id,
      });
    });
};

// Delete a MeetingTime with the specified id in the request
exports.delete = (req, res) => {
  const id = req.params.id;

  logger.debug(`Attempting to delete meeting time: ${id}`);

  MeetingTime.destroy({
    where: { id: id },
  })
    .then((num) => {
      if (num == 1) {
        logger.info(`MeetingTime ${id} deleted successfully`);
        res.send({
          message: "MeetingTime was deleted successfully!",
        });
      } else {
        logger.warn(`Cannot delete meeting time ${id} - not found`);
        res.send({
          message: `Cannot delete MeetingTime with id=${id}. Maybe MeetingTime was not found!`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error deleting meeting time ${id}: ${err.message}`);
      res.status(500).send({
        message: "Could not delete MeetingTime with id=" + id,
      });
    });
};

// Delete all meeting times for a specific section
exports.deleteBySectionId = (req, res) => {
  const sectionId = req.params.sectionId;

  logger.debug(`Attempting to delete meeting times for sectionId: ${sectionId}`);

  MeetingTime.destroy({
    where: { sectionId: sectionId },
  })
    .then((num) => {
      if (num >= 1) {
        logger.info(
          `MeetingTime(s) deleted successfully for section: ${sectionId}`
        );
        res.send({
          message: "MeetingTime(s) were deleted successfully!",
        });
      } else {
        logger.warn(
          `Cannot delete meeting times for sectionId ${sectionId} - not found`
        );
        res.send({
          message: `Cannot delete MeetingTimes for sectionId=${sectionId}. Maybe MeetingTimes were not found!`,
        });
      }
    })
    .catch((err) => {
      logger.error(
        `Error deleting meeting times for sectionId ${sectionId}: ${err.message}`
      );
      res.status(500).send({
        message: "Could not delete MeetingTimes for sectionId=" + sectionId,
      });
    });
};

// Import meeting times from CSV file
exports.importCSV = async (req, res) => {
  logger.debug("Starting CSV import for meeting times");

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

      // Find column indices for required and optional columns
      // Extra columns in the CSV file will be ignored
      const sectionCodeIndex = headers.findIndex(h => h === 'section_code');
      const mondayIndex = headers.findIndex(h => h === 'monday');
      const tuesdayIndex = headers.findIndex(h => h === 'tuesday');
      const wednesdayIndex = headers.findIndex(h => h === 'wednesday');
      const thursdayIndex = headers.findIndex(h => h === 'thursday');
      const fridayIndex = headers.findIndex(h => h === 'friday');
      const saturdayIndex = headers.findIndex(h => h === 'saturday');
      const sundayIndex = headers.findIndex(h => h === 'sunday');
      const startTimeIndex = headers.findIndex(h => h === 'start_time');
      const endTimeIndex = headers.findIndex(h => h === 'end_time');

      // Validate that all required columns exist
      // Note: Extra columns in CSV will be automatically ignored
      if (sectionCodeIndex === -1 || startTimeIndex === -1 || endTimeIndex === -1) {
        return res.status(400).json({ 
          message: "CSV must contain columns: section_code, start_time, end_time. Extra columns will be ignored." 
        });
      }

      // Log any extra columns that will be ignored (optional - for debugging)
      const requiredColumns = ['section_code', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'start_time', 'end_time'];
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

          const sectionCode = values[sectionCodeIndex] ? values[sectionCodeIndex].trim() : null;
          const monday = values[mondayIndex] ? (parseInt(values[mondayIndex].trim()) === 1) : false;
          const tuesday = values[tuesdayIndex] ? (parseInt(values[tuesdayIndex].trim()) === 1) : false;
          const wednesday = values[wednesdayIndex] ? (parseInt(values[wednesdayIndex].trim()) === 1) : false;
          const thursday = values[thursdayIndex] ? (parseInt(values[thursdayIndex].trim()) === 1) : false;
          const friday = values[fridayIndex] ? (parseInt(values[fridayIndex].trim()) === 1) : false;
          const saturday = values[saturdayIndex] ? (parseInt(values[saturdayIndex].trim()) === 1) : false;
          const sunday = values[sundayIndex] ? (parseInt(values[sundayIndex].trim()) === 1) : false;
          const startTime = values[startTimeIndex] ? values[startTimeIndex].trim() : null;
          const endTime = values[endTimeIndex] ? values[endTimeIndex].trim() : null;

          if (!sectionCode || !startTime || !endTime) {
            errors.push(`Row ${i + 1}: Missing required fields (section_code, start_time, or end_time)`);
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

          // Create meeting time
          try {
            await MeetingTime.create({
              sectionId: section.id,
              monday,
              tuesday,
              wednesday,
              thursday,
              friday,
              saturday,
              sunday,
              startTime,
              endTime,
              sectionCode,
            });
            addedCount++;
            logger.debug(`Added meeting time: sectionId=${section.id}, sectionCode=${sectionCode}, ${startTime}-${endTime}`);
          } catch (createErr) {
            // If duplicate key error, skip it
            if (createErr.name === 'SequelizeUniqueConstraintError' || 
                createErr.message.includes('Duplicate entry') ||
                createErr.message.includes('duplicate key')) {
              logger.debug(`Skipping duplicate meeting time at row ${i + 1}: sectionId=${section.id}, ${startTime}-${endTime}`);
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

