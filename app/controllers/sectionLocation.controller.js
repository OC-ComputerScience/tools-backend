import db from "../models/index.js";
import logger from "../config/logger.js";
import multer from "multer";

const SectionLocation = db.SectionLocation;
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

// Create and Save a new SectionLocation
exports.create = (req, res) => {
  if (!req.body.sectionId || !req.body.locationName) {
    logger.warn("SectionLocation creation attempt with missing required fields");
    res.status(400).send({
      message: "Section ID and location name are required!",
    });
    return;
  }

  const sectionLocation = {
    sectionId: req.body.sectionId,
    locationName: req.body.locationName,
  };

  logger.debug(`Creating section location for section: ${sectionLocation.sectionId}`);

  SectionLocation.create(sectionLocation)
    .then((data) => {
      logger.info(`SectionLocation created successfully: ${data.id}`);
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error creating section location: ${err.message}`);
      res.status(500).send({
        message:
          err.message ||
          "Some error occurred while creating the SectionLocation.",
      });
    });
};

// Retrieve all SectionLocations from the database
exports.findAll = (req, res) => {
  const sectionId = req.query.sectionId;

  let condition = sectionId ? { sectionId: sectionId } : {};

  logger.debug(
    `Fetching section locations with condition: ${JSON.stringify(condition)}`
  );

  SectionLocation.findAll({
    where: condition,
    include: [{ model: Section, as: "section" }],
    order: [["locationName", "ASC"]],
  })
    .then((data) => {
      logger.info(`Retrieved ${data.length} section locations`);
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error retrieving section locations: ${err.message}`);
      res.status(500).send({
        message:
          err.message ||
          "Some error occurred while retrieving section locations.",
      });
    });
};

// Find a single SectionLocation with an id
exports.findOne = (req, res) => {
  const id = req.params.id;
  logger.debug(`Finding section location with id: ${id}`);

  SectionLocation.findByPk(id, {
    include: [{ model: Section, as: "section" }],
  })
    .then((data) => {
      if (data) {
        logger.info(`SectionLocation found: ${id}`);
        res.send(data);
      } else {
        logger.warn(`SectionLocation not found with id: ${id}`);
        res.status(404).send({
          message: `Cannot find SectionLocation with id=${id}.`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error retrieving section location ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error retrieving SectionLocation with id=" + id,
      });
    });
};

// Find all locations for a specific section
exports.findBySectionId = (req, res) => {
  const sectionId = req.params.sectionId;
  logger.debug(`Finding locations for sectionId: ${sectionId}`);

  SectionLocation.findAll({
    where: { sectionId: sectionId },
    include: [{ model: Section, as: "section" }],
    order: [["locationName", "ASC"]],
  })
    .then((data) => {
      logger.info(`Retrieved ${data.length} locations for section: ${sectionId}`);
      res.send(data);
    })
    .catch((err) => {
      logger.error(
        `Error retrieving locations for section ${sectionId}: ${err.message}`
      );
      res.status(500).send({
        message: "Error retrieving SectionLocations for section=" + sectionId,
      });
    });
};

// Update a SectionLocation by the id in the request
exports.update = (req, res) => {
  const id = req.params.id;

  logger.debug(
    `Updating section location ${id} with data: ${JSON.stringify(req.body)}`
  );

  SectionLocation.update(req.body, {
    where: { id: id },
  })
    .then((num) => {
      if (num == 1) {
        logger.info(`SectionLocation ${id} updated successfully`);
        res.send({
          message: "SectionLocation was updated successfully.",
        });
      } else {
        logger.warn(
          `Failed to update section location ${id} - not found or empty body`
        );
        res.send({
          message: `Cannot update SectionLocation with id=${id}. Maybe SectionLocation was not found or req.body is empty!`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error updating section location ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error updating SectionLocation with id=" + id,
      });
    });
};

// Delete a SectionLocation with the specified id in the request
exports.delete = (req, res) => {
  const id = req.params.id;

  logger.debug(`Attempting to delete section location: ${id}`);

  SectionLocation.destroy({
    where: { id: id },
  })
    .then((num) => {
      if (num == 1) {
        logger.info(`SectionLocation ${id} deleted successfully`);
        res.send({
          message: "SectionLocation was deleted successfully!",
        });
      } else {
        logger.warn(`Cannot delete section location ${id} - not found`);
        res.send({
          message: `Cannot delete SectionLocation with id=${id}. Maybe SectionLocation was not found!`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error deleting section location ${id}: ${err.message}`);
      res.status(500).send({
        message: "Could not delete SectionLocation with id=" + id,
      });
    });
};

// Delete all locations for a specific section
exports.deleteBySectionId = (req, res) => {
  const sectionId = req.params.sectionId;

  logger.debug(`Attempting to delete locations for sectionId: ${sectionId}`);

  SectionLocation.destroy({
    where: { sectionId: sectionId },
  })
    .then((num) => {
      if (num >= 1) {
        logger.info(
          `SectionLocation(s) deleted successfully for section: ${sectionId}`
        );
        res.send({
          message: "SectionLocation(s) were deleted successfully!",
        });
      } else {
        logger.warn(
          `Cannot delete locations for sectionId ${sectionId} - not found`
        );
        res.send({
          message: `Cannot delete SectionLocations for sectionId=${sectionId}. Maybe SectionLocations were not found!`,
        });
      }
    })
    .catch((err) => {
      logger.error(
        `Error deleting locations for sectionId ${sectionId}: ${err.message}`
      );
      res.status(500).send({
        message: "Could not delete SectionLocations for sectionId=" + sectionId,
      });
    });
};

// Import section locations from CSV file
exports.importCSV = async (req, res) => {
  logger.debug("Starting CSV import for section locations");

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
      const sectionCodeIndex = headers.findIndex(h => h === 'section_code');
      const roomNumberIndex = headers.findIndex(h => h === 'room_number');

      // Validate that all required columns exist
      if (sectionCodeIndex === -1 || roomNumberIndex === -1) {
        return res.status(400).json({ 
          message: "CSV must contain columns: section_code, room_number" 
        });
      }

      // Log any extra columns that will be ignored
      const requiredColumns = ['section_code', 'room_number'];
      const extraColumns = headers.filter(h => !requiredColumns.includes(h));
      if (extraColumns.length > 0) {
        logger.debug(`Ignoring extra columns in CSV: ${extraColumns.join(', ')}`);
      }

      let addedCount = 0;
      let skippedCount = 0;
      const errors = [];

      // Process each data row
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        try {
          const values = parseCSVLine(line);

          const sectionCode = values[sectionCodeIndex] ? values[sectionCodeIndex].trim() : null;
          const roomNumber = values[roomNumberIndex] ? values[roomNumberIndex].trim() : null;

          if (!sectionCode || !roomNumber) {
            errors.push(`Row ${i + 1}: Missing required fields (section_code or room_number)`);
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

          // Check if this location already exists for this section
          const existingLocation = await SectionLocation.findOne({
            where: { 
              sectionId: section.id,
              locationName: roomNumber 
            }
          });

          if (existingLocation) {
            logger.debug(`Skipping duplicate location at row ${i + 1}: sectionId=${section.id}, locationName=${roomNumber}`);
            skippedCount++;
            continue;
          }

          // Create section location
          try {
            await SectionLocation.create({
              sectionId: section.id,
              locationName: roomNumber,
            });
            addedCount++;
            logger.debug(`Added section location: sectionId=${section.id}, locationName=${roomNumber}`);
          } catch (createErr) {
            // If duplicate key error, skip it
            if (createErr.name === 'SequelizeUniqueConstraintError' || 
                createErr.message.includes('Duplicate entry') ||
                createErr.message.includes('duplicate key')) {
              logger.debug(`Skipping duplicate section location at row ${i + 1}: sectionId=${section.id}, locationName=${roomNumber}`);
              skippedCount++;
              continue;
            }
            throw createErr;
          }
        } catch (rowErr) {
          logger.error(`Error processing row ${i + 1}: ${rowErr.message}`);
          errors.push(`Row ${i + 1}: ${rowErr.message}`);
        }
      }

      logger.info(`CSV import completed: ${addedCount} added, ${skippedCount} skipped, ${errors.length} errors`);
      
      res.status(200).json({
        message: "CSV import completed",
        added: addedCount,
        skipped: skippedCount,
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
