import db from "../models/index.js";
import logger from "../config/logger.js";
import multer from "multer";

const Section = db.section;
const AssignedCourse = db.assignedCourse;
const User = db.user;
const UserSection = db.userSection;
const Semester = db.Semester;
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

// Create and Save a new Section
exports.create = (req, res) => {
  if (!req.body.semesterId || !req.body.courseNumber || !req.body.courseSection) {
    logger.warn("Section creation attempt with missing required fields");
    res.status(400).send({
      message: "Semester ID, course number, and course section are required!",
    });
    return;
  }

  const section = {
    semesterId: req.body.semesterId,
    courseNumber: req.body.courseNumber,
    courseSection: req.body.courseSection,
    courseDescription: req.body.courseDescription || null,
  };

  logger.debug(`Creating section: ${section.courseNumber}-${section.courseSection}`);

  Section.create(section)
    .then((data) => {
      logger.info(`Section created successfully: ${data.id}`);
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error creating section: ${err.message}`);
      res.status(500).send({
        message: err.message || "Some error occurred while creating the Section.",
      });
    });
};

// Retrieve all Sections from the database
exports.findAll = (req, res) => {
  const semesterId = req.query.semesterId;

  let condition = {};
  if (semesterId) {
    condition.semesterId = semesterId;
  }

  logger.debug(`Fetching sections with condition: ${JSON.stringify(condition)}`);

  Section.findAll({
    where: condition,
    include: [
      { model: Semester, as: "semester", attributes: ["id", "name", "startDate", "endDate"] },
    ],
    order: [["courseNumber", "ASC"], ["courseSection", "ASC"]],
  })
    .then((data) => {
      logger.info(`Retrieved ${data.length} sections`);
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error retrieving sections: ${err.message}`);
      res.status(500).send({
        message: err.message || "Some error occurred while retrieving sections.",
      });
    });
};

// Retrieve all Sections with assignment count information
exports.findAllWithCount = (req, res) => {
  const semesterId = req.query.semesterId;

  let condition = {};
  if (semesterId) {
    condition.semesterId = semesterId;
  }

  logger.debug(`Fetching sections with count, condition: ${JSON.stringify(condition)}`);

  Section.findAll({
    where: condition,
    include: [
      { model: Semester, as: "semester", attributes: ["id", "name", "startDate", "endDate"] },
    ],
    order: [["courseNumber", "ASC"], ["courseSection", "ASC"]],
  })
    .then(async (data) => {
      // Fetch assigned courses with includes - now that model fields match database
      const sectionIds = data.map(s => s.id);
      const assignedCourses = await AssignedCourse.findAll({
        where: {
          sectionId: { [Op.in]: sectionIds }
        },
        include: [
          {
            model: Section,
            as: "assignedSection",
            attributes: ["id", "courseNumber", "courseSection", "courseDescription"],
          },
        ],
      });

      // Group assigned courses by sectionId
      const assignedBySectionId = {};
      assignedCourses.forEach(ac => {
        if (!assignedBySectionId[ac.sectionId]) {
          assignedBySectionId[ac.sectionId] = [];
        }
        assignedBySectionId[ac.sectionId].push(ac.toJSON());
      });

      // Transform the data to include assignment info in a more frontend-friendly format
      const transformedData = data.map((section) => {
        const sectionJson = section.toJSON();
        const assignedSections = assignedBySectionId[section.id] || [];
        // Get the first assigned section if any exist
        const assignedSectionInfo =
          assignedSections.length > 0 && assignedSections[0].assignedSection
            ? assignedSections[0].assignedSection
            : null;
        
        return {
          ...sectionJson,
          assignedSectionInfo: assignedSectionInfo,
          assignedCourse: assignedSections, // Keep array for compatibility
        };
      });

      logger.info(`Retrieved ${transformedData.length} sections with count`);
      res.send(transformedData);
    })
    .catch((err) => {
      logger.error(`Error retrieving sections with count: ${err.message}`);
      res.status(500).send({
        message: err.message || "Some error occurred while retrieving sections with count.",
      });
    });
};

// Find sections by user email (using user_sections join table)
exports.findByUserEmail = async (req, res) => {
  const email = req.params.email;
  const semesterId = req.query.semesterId;

  logger.debug(`Finding sections for user email: ${email}, semesterId: ${semesterId}`);

  try {
    // First find the user by email
    const user = await User.findOne({
      where: { email: email },
    });

    if (!user) {
      logger.warn(`User not found with email: ${email}`);
      return res.send([]);
    }

    // Use the user_sections join table to find sections for this user
    let userSectionCondition = { userId: user.id };
    const userSections = await UserSection.findAll({
      where: userSectionCondition,
      include: [
        {
          model: Section,
          as: "section",
          attributes: ["id", "courseNumber", "courseSection", "courseDescription", "semesterId"],
          include: [
            { model: Semester, as: "semester", attributes: ["id", "name", "startDate", "endDate"] },
          ],
          ...(semesterId ? { where: { semesterId: semesterId } } : {}),
        },
      ],
    });

    // Extract sections from userSection relationships
    let sections = userSections
      .map(us => us.section)
      .filter(s => s !== null);
    
    if (semesterId) {
      sections = sections.filter(s => s.semesterId === parseInt(semesterId));
    }
    
    // Sort sections
    sections.sort((a, b) => {
      const courseCompare = a.courseNumber.localeCompare(b.courseNumber);
      return courseCompare !== 0 ? courseCompare : a.courseSection.localeCompare(b.courseSection);
    });

    // Continue with existing logic to fetch assigned courses
    const sectionIds = sections.map(s => s.id);
    const assignedCourses = await AssignedCourse.findAll({
      where: {
        sectionId: { [Op.in]: sectionIds }
      },
      include: [
        {
          model: Section,
          as: "assignedSection",
          attributes: ["id", "courseNumber", "courseSection", "courseDescription"],
          include: [
            { model: Semester, as: "semester", attributes: ["id", "name", "startDate", "endDate"] },
          ],
        },
      ],
    });

    // Group assigned courses by sectionId
    const assignedBySectionId = {};
    assignedCourses.forEach(ac => {
      if (!assignedBySectionId[ac.sectionId]) {
        assignedBySectionId[ac.sectionId] = [];
      }
      assignedBySectionId[ac.sectionId].push(ac.toJSON());
    });

    // Transform data to match frontend expectations
    const transformedData = sections.map((section) => {
      const sectionJson = section.toJSON ? section.toJSON() : section;
      // Get the first assigned course record if any exist
      const assignedSections = assignedBySectionId[section.id] || [];
      // Frontend expects assignedCourse to be the full AssignedCourse object with nested assignedSection
      const assignedCourse =
        assignedSections.length > 0
          ? assignedSections[0] // Return the full AssignedCourse object which includes assignedSection
          : null;

      return {
        ...sectionJson,
        assignedCourse: assignedCourse, // Full AssignedCourse object with nested assignedSection
      };
    });

    logger.info(`Retrieved ${transformedData.length} sections for user email: ${email}`);
    res.send(transformedData);
  } catch (err) {
    logger.error(`Error retrieving sections for user email ${email}: ${err.message}`);
    res.status(500).send({
      message: err.message || "Some error occurred while retrieving sections for user.",
    });
  }
};

// Find a single Section with an id
exports.findOne = (req, res) => {
  const id = req.params.id;
  logger.debug(`Finding section with id: ${id}`);

  Section.findByPk(id, {
    include: [
      { model: Semester, as: "semester", attributes: ["id", "name", "startDate", "endDate"] },
    ],
  })
    .then((data) => {
      if (data) {
        logger.info(`Section found: ${id}`);
        res.send(data);
      } else {
        logger.warn(`Section not found with id: ${id}`);
        res.status(404).send({
          message: `Cannot find Section with id=${id}.`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error retrieving section ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error retrieving Section with id=" + id,
      });
    });
};

// Update a Section by the id in the request
exports.update = (req, res) => {
  const id = req.params.id;

  logger.debug(`Updating section ${id} with data: ${JSON.stringify(req.body)}`);

  Section.update(req.body, {
    where: { id: id },
  })
    .then((num) => {
      if (num == 1) {
        logger.info(`Section ${id} updated successfully`);
        res.send({
          message: "Section was updated successfully.",
        });
      } else {
        logger.warn(`Failed to update section ${id} - not found or empty body`);
        res.send({
          message: `Cannot update Section with id=${id}. Maybe Section was not found or req.body is empty!`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error updating section ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error updating Section with id=" + id,
      });
    });
};

// Delete a Section with the specified id in the request
exports.delete = (req, res) => {
  const id = req.params.id;

  logger.debug(`Attempting to delete section: ${id}`);

  Section.destroy({
    where: { id: id },
  })
    .then((num) => {
      if (num == 1) {
        logger.info(`Section ${id} deleted successfully`);
        res.send({
          message: "Section was deleted successfully!",
        });
      } else {
        logger.warn(`Cannot delete section ${id} - not found`);
        res.send({
          message: `Cannot delete Section with id=${id}. Maybe Section was not found!`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error deleting section ${id}: ${err.message}`);
      res.status(500).send({
        message: "Could not delete Section with id=" + id,
      });
    });
};

// Import sections from CSV file
exports.importCSV = async (req, res) => {
  logger.debug("Starting CSV import for sections");

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
      const courseIdIndex = headers.findIndex(h => h === 'course_id');
      const shortNameIndex = headers.findIndex(h => h === 'short_name');
      const longNameIndex = headers.findIndex(h => h === 'long_name');
      const termIdIndex = headers.findIndex(h => h === 'term_id');
      const accountIdIndex = headers.findIndex(h => h === 'account_id'); // Optional

      // Validate that all required columns exist
      // Note: Extra columns in CSV will be automatically ignored
      if (courseIdIndex === -1 || shortNameIndex === -1 || longNameIndex === -1 || termIdIndex === -1) {
        return res.status(400).json({ 
          message: "CSV must contain columns: course_id, short_name, long_name, term_id. Extra columns will be ignored." 
        });
      }

      // Log any extra columns that will be ignored (optional - for debugging)
      const requiredColumns = ['course_id', 'short_name', 'long_name', 'term_id', 'account_id'];
      const extraColumns = headers.filter(h => !requiredColumns.includes(h));
      if (extraColumns.length > 0) {
        logger.debug(`Ignoring extra columns in CSV: ${extraColumns.join(', ')}`);
      }

      // Fetch all semesters to create a lookup map by name
      const Semester = db.Semester;
      const allSemesters = await Semester.findAll();
      const semesterMap = new Map();
      allSemesters.forEach(sem => {
        semesterMap.set(sem.name.toLowerCase(), sem.id);
      });
      logger.debug(`Loaded ${allSemesters.length} semesters for lookup`);

      let addedCount = 0;
      const errors = [];

      // Process each data row
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        try {
          const values = parseCSVLine(line);

          const sectionCode = values[courseIdIndex] ? values[courseIdIndex].trim() : null;
          const shortName = values[shortNameIndex] ? values[shortNameIndex].trim() : '';
          const courseDescription = values[longNameIndex] ? values[longNameIndex].trim() : null;
          const termIdValue = values[termIdIndex] ? values[termIdIndex].trim() : null;
          const accountId = values[accountIdIndex] ? values[accountIdIndex].trim() : null;

          if (!shortName) {
            errors.push(`Row ${i + 1}: Missing required field (short_name)`);
            continue;
          }

          if (!termIdValue) {
            errors.push(`Row ${i + 1}: Missing required field (term_id)`);
            continue;
          }

          // Parse course number and section number by splitting on the last dash
          // Format: PREFIX-NUMBER(-SUFFIX)-SECTION
          // Examples: CMSC-1111-01 -> course: CMSC-1111, section: 01
          //           CMSC-1111L-01 -> course: CMSC-1111L, section: 01
          const lastDashIndex = shortName.lastIndexOf('-');
          if (lastDashIndex === -1 || lastDashIndex === 0 || lastDashIndex === shortName.length - 1) {
            errors.push(`Row ${i + 1}: short_name must contain at least one dash to separate course number and section: ${shortName}`);
            continue;
          }

          const courseNumber = shortName.substring(0, lastDashIndex).trim();
          const courseSection = shortName.substring(lastDashIndex + 1).trim();

          if (!courseNumber || !courseSection) {
            errors.push(`Row ${i + 1}: Could not parse course number or section from short_name: ${shortName}`);
            continue;
          }

          // Look up semester by name from term_id field
          const semesterId = semesterMap.get(termIdValue.toLowerCase());
          if (!semesterId) {
            errors.push(`Row ${i + 1}: Semester not found with name: ${termIdValue}`);
            continue;
          }

          // Check for duplicate: same semester, course number, and section number
          const existingSection = await Section.findOne({
            where: {
              semesterId: semesterId,
              courseNumber: courseNumber,
              courseSection: courseSection,
            }
          });

          if (existingSection) {
            logger.debug(`Skipping duplicate section at row ${i + 1}: ${courseNumber}-${courseSection} in semester ${semesterId}`);
            continue;
          }

          // Create section
          try {
            await Section.create({
              semesterId: semesterId,
              courseNumber,
              courseSection,
              courseDescription,
              sectionCode,
              accountId,
            });
            addedCount++;
            logger.debug(`Added section: ${courseNumber}-${courseSection} (${sectionCode}) in semester ${termIdValue} (id: ${semesterId})`);
          } catch (createErr) {
            // If duplicate key error, skip it
            if (createErr.name === 'SequelizeUniqueConstraintError' || 
                createErr.message.includes('Duplicate entry') ||
                createErr.message.includes('duplicate key')) {
              logger.debug(`Skipping duplicate section at row ${i + 1}: ${courseNumber}-${courseSection}`);
              continue;
            }
            // Log the full error for debugging
            logger.error(`Error creating section at row ${i + 1}:`, {
              error: createErr.message,
              stack: createErr.stack,
              courseNumber,
              courseSection,
              semesterId
            });
            errors.push(`Row ${i + 1}: Error creating section - ${createErr.message}`);
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
