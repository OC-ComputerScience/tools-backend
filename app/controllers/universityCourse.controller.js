import db from "../models/index.js";
import logger from "../config/logger.js";
import multer from "multer";

const UniversityCourse = db.UniversityCourse;
const University = db.University;
const Course = db.course;

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

// Create a new UniversityCourse
exports.create = async (req, res) => {
  try {
    logger.debug(`Creating university course with data: ${JSON.stringify(req.body)}`);
    const universityCourse = await UniversityCourse.create(req.body);
    // Fetch the created course with relationships
    const createdCourse = await UniversityCourse.findByPk(universityCourse.id, {
      include: [
        { model: University },
        { model: db.course, as: 'course' }
      ],
    });
    logger.info(`University course created successfully: ${universityCourse.id}`);
    res.status(201).json(createdCourse);
  } catch (error) {
    logger.error(`Error creating university course: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

// Get all UniversityCourses
exports.findAll = async (req, res) => {
  try {
    logger.debug("Fetching all university courses");
    const universityCourses = await UniversityCourse.findAll({
      include: [
        { model: University },
        { model: db.course, as: 'course' }
      ],
    });
    logger.info(`Retrieved ${universityCourses.length} university courses`);
    res.json(universityCourses);
  } catch (error) {
    logger.error(`Error retrieving university courses: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

// Get all UniversityCourses by University
exports.findAllforUniversity = async (req, res) => {
  const universityId = req.params.universityId;
  try {
    logger.debug(`Fetching university courses for university: ${universityId}`);
    const universityCourses = await UniversityCourse.findAll({
      where: { universityId: universityId },
      include: [
        { model: University },
        { model: db.course, as: 'course' }
      ],
    });
    logger.info(`Retrieved ${universityCourses.length} university courses for university: ${universityId}`);
    res.json(universityCourses);
  } catch (error) {
    logger.error(`Error retrieving university courses for university ${universityId}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

// Get a single UniversityCourse by id
exports.findOne = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Finding university course with id: ${id}`);
    const universityCourse = await UniversityCourse.findByPk(id, {
      include: [
        { model: University },
        { model: db.course, as: 'course' }
      ],
    });
    if (!universityCourse) {
      logger.warn(`University course not found with id: ${id}`);
      return res.status(404).json({ message: "University Course not found" });
    }
    logger.info(`University course found: ${id}`);
    res.json(universityCourse);
  } catch (error) {
    logger.error(`Error retrieving university course ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

// Update a UniversityCourse
exports.update = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Updating university course ${id} with data: ${JSON.stringify(req.body)}`);
    const universityCourse = await UniversityCourse.findByPk(id);
    if (!universityCourse) {
      logger.warn(`University course not found with id: ${id}`);
      return res.status(404).json({ message: "University Course not found" });
    }
    await universityCourse.update(req.body);
    // Fetch the updated course with relationships
    const updatedCourse = await UniversityCourse.findByPk(id, {
      include: [
        { model: University },
        { model: db.course, as: 'course' }
      ],
    });
    logger.info(`University course ${id} updated successfully`);
    res.json(updatedCourse);
  } catch (error) {
    logger.error(`Error updating university course ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

// Delete a UniversityCourse
exports.delete = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Attempting to delete university course: ${id}`);
    const universityCourse = await UniversityCourse.findByPk(id);
    if (!universityCourse) {
      logger.warn(`University course not found with id: ${id}`);
      return res.status(404).json({ message: "University Course not found" });
    }
    await universityCourse.destroy();
    logger.info(`University course ${id} deleted successfully`);
    res.json({ message: "University Course deleted successfully" });
  } catch (error) {
    logger.error(`Error deleting university course ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

// Helper function to parse CSV line (handles quoted values)
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

// Import university courses from CSV file
exports.importCSV = async (req, res) => {
  logger.debug("Starting CSV import for university courses");

  csvUpload(req, res, async function (err) {
    logger.debug("CSV upload callback invoked");
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

    logger.debug("File received, starting processing");

    try {
      // Parse CSV file
      const csvContent = req.file.buffer.toString('utf-8');
      const lines = csvContent.split('\n').filter(line => line.trim() !== '');
      
      if (lines.length < 2) {
        return res.status(400).json({ message: "CSV file must have at least a header row and one data row" });
      }

      // Parse header row (case-insensitive)
      const headers = lines[0].split(',').map(h => h.trim());
      const headersLower = headers.map(h => h.toLowerCase());
      logger.debug(`CSV headers: ${headers.join(', ')}`);

      // Find column indices (case-insensitive, flexible matching)
      const universityIdIndex = headersLower.findIndex(h => 
        h === 'transfer institution id' || h.includes('transfer institution')
      );
      const courseNumberIndex = headersLower.findIndex(h => 
        h === 'transfer courses' || 
        h === 'transferred courses' ||
        h === 'transfeered coures' ||
        h.includes('transfer course')
      );
      const courseNameIndex = headersLower.findIndex(h => 
        h === 'transfer title' || 
        h === 'transferr title' ||
        h === 'transferred title' || 
        h === 'transfered title' ||
        h.includes('transfer title')
      );
      const courseHoursIndex = headersLower.findIndex(h => 
        h === 'transfer cred' || 
        h === 'transfer credits' || 
        h.includes('transfer cred')
      );
      const ocCourseIndex = headersLower.findIndex(h => 
        h === 'oc course' || h.includes('oc course')
      );

      if (universityIdIndex === -1 || courseNumberIndex === -1 || courseNameIndex === -1 || 
          courseHoursIndex === -1 || ocCourseIndex === -1) {
        return res.status(400).json({ 
          message: "CSV must contain columns: Transfer Institution ID, Transfer Courses (or Transferred Courses), Transfer Title (or Transferred Title), Transfer Cred (or Transfer Credits), OC Course" 
        });
      }

      let addedCount = 0;
      const errors = [];

      // Process each data row
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        try {
          const values = parseCSVLine(line);

          const ocUniversityId = values[universityIdIndex] ? parseInt(values[universityIdIndex].trim()) : null;
          const courseNumber = values[courseNumberIndex] ? values[courseNumberIndex].trim() : '';
          const courseName = values[courseNameIndex] ? values[courseNameIndex].trim() : '';
          const courseHours = values[courseHoursIndex] ? parseInt(values[courseHoursIndex].trim()) : null;
          const ocCourseNumber = values[ocCourseIndex] ? values[ocCourseIndex].trim() : '';

          if (!ocUniversityId || isNaN(ocUniversityId) || !courseNumber || !courseName || 
              !courseHours || isNaN(courseHours) || !ocCourseNumber) {
            errors.push(`Row ${i + 1}: Missing required fields`);
            continue;
          }

          // Look up university by oc_university_id
          const university = await University.findOne({
            where: { oc_university_id: ocUniversityId }
          });
          if (!university) {
            errors.push(`Row ${i + 1}: University not found with oc_university_id: ${ocUniversityId}`);
            continue;
          }
          
          const universityId = university.id;

          // Look up OC course by number
          const ocCourse = await Course.findOne({
            where: {
              number: ocCourseNumber
            }
          });

          if (!ocCourse) {
            errors.push(`Row ${i + 1}: OC Course not found with number: ${ocCourseNumber}`);
            continue;
          }

          // Check for duplicate (same university, course number)
          const existing = await UniversityCourse.findOne({
            where: {
              universityId: universityId,
              courseNumber: courseNumber
            }
          });

          if (existing) {
            errors.push(`Row ${i + 1}: University course already exists for university ${universityId} and course number ${courseNumber}`);
            continue;
          }

          // Create university course
          // Use courseName for courseDescription since it's required
          await UniversityCourse.create({
            universityId: universityId,
            courseNumber: courseNumber,
            courseName: courseName,
            courseDescription: courseName, // Use courseName as description since CSV doesn't have it
            courseHours: courseHours,
            courseId: ocCourse.id
          });

          addedCount++;
        } catch (rowError) {
          logger.error(`Error processing row ${i + 1}: ${rowError.message}`);
          errors.push(`Row ${i + 1}: ${rowError.message}`);
        }
      }

      res.status(200).json({
        message: "CSV import completed",
        added: addedCount,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error) {
      logger.error(`Error processing CSV import: ${error.message}`);
      logger.error(`Error stack: ${error.stack}`);
      res.status(500).json({ 
        message: error.message || "Error processing CSV import",
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });
};

export default exports;
