import db from "../models/index.js";
import logger from "../config/logger.js";

const TranscriptCourse = db.TranscriptCourse;
const UniversityTranscript = db.UniversityTranscript;
const UniversityCourse = db.UniversityCourse;
const Course = db.course;
const Semester = db.Semester;

const exports = {};

// Helper function to update transcript status based on courses
const updateTranscriptStatus = async (transcriptId) => {
  try {
    const transcriptCourses = await TranscriptCourse.findAll({
      where: { universityTranscriptId: transcriptId }
    });

    if (transcriptCourses.length === 0) {
      // No courses, status should be "Not Process"
      await UniversityTranscript.update(
        { status: "Not Process" },
        { where: { id: transcriptId } }
      );
      return;
    }

    const allApproved = transcriptCourses.every(
      course => course.status === "Approved"
    );
    const anyApproved = transcriptCourses.some(
      course => course.status === "Approved" || course.status === "Matched"
    );

    let newStatus = "Not Process";
    if (allApproved) {
      newStatus = "Completed";
    } else if (anyApproved) {
      newStatus = "In-Progress";
    }

    await UniversityTranscript.update(
      { status: newStatus },
      { where: { id: transcriptId } }
    );
    
    logger.debug(`Updated transcript ${transcriptId} status to ${newStatus}`);
  } catch (error) {
    logger.error(`Error updating transcript status: ${error.message}`);
  }
};

// Create a new TranscriptCourse
exports.create = async (req, res) => {
  try {
    logger.debug(`Creating transcript course with data: ${JSON.stringify(req.body)}`);
    const transcriptCourse = await TranscriptCourse.create(req.body);
    
    // Update transcript status after course creation
    await updateTranscriptStatus(transcriptCourse.universityTranscriptId);
    
    const createdCourse = await TranscriptCourse.findByPk(
      transcriptCourse.id,
      {
        include: [
          { model: UniversityTranscript },
          { model: UniversityCourse },
          { model: Course, as: 'course' },
          { model: Semester },
        ],
      }
    );
    logger.info(`Transcript course created successfully: ${transcriptCourse.id}`);
    res.status(201).json(createdCourse);
  } catch (error) {
    logger.error(`Error creating transcript course: ${error.message}`);
    logger.error(`Error stack: ${error.stack}`);
    res.status(500).json({ message: error.message });
  }
};

// Get all TranscriptCourses
exports.findAll = async (req, res) => {
  try {
    logger.debug("Fetching all transcript courses");
    const transcriptCourses = await TranscriptCourse.findAll({
      include: [
        { model: UniversityTranscript },
        { model: UniversityCourse },
          { model: Course, as: 'course' },
        { model: Semester },
      ],
    });
    logger.info(`Retrieved ${transcriptCourses.length} transcript courses`);
    res.json(transcriptCourses);
  } catch (error) {
    logger.error(`Error retrieving transcript courses: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

// Get all TranscriptCourses by transcriptId
exports.getByTranscriptId = async (req, res) => {
  const transcriptId = req.params.transcriptId;
  try {
    logger.debug(`Fetching transcript courses for transcript: ${transcriptId}`);
    const transcriptCourses = await TranscriptCourse.findAll({
      where: { universityTranscriptId: transcriptId },
      include: [
        { model: UniversityTranscript },
        { model: UniversityCourse },
          { model: Course, as: 'course' },
        { model: Semester },
      ],
    });
    logger.info(`Retrieved ${transcriptCourses.length} transcript courses for transcript: ${transcriptId}`);
    res.json(transcriptCourses);
  } catch (error) {
    logger.error(`Error retrieving transcript courses for transcript ${transcriptId}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

// Get a single TranscriptCourse by id
exports.findOne = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Finding transcript course with id: ${id}`);
    const transcriptCourse = await TranscriptCourse.findByPk(id, {
      include: [
        { model: UniversityTranscript },
        { model: UniversityCourse },
          { model: Course, as: 'course' },
        { model: Semester },
      ],
    });
    if (!transcriptCourse) {
      logger.warn(`Transcript course not found with id: ${id}`);
      return res.status(404).json({ message: "Transcript Course not found" });
    }
    logger.info(`Transcript course found: ${id}`);
    res.json(transcriptCourse);
  } catch (error) {
    logger.error(`Error retrieving transcript course ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

// Update a TranscriptCourse
exports.update = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Updating transcript course ${id} with data: ${JSON.stringify(req.body)}`);
    const transcriptCourse = await TranscriptCourse.findByPk(id);
    if (!transcriptCourse) {
      logger.warn(`Transcript course not found with id: ${id}`);
      return res.status(404).json({ message: "Transcript Course not found" });
    }
    
    // Ensure transcriptCourse is a Sequelize instance with update method
    if (typeof transcriptCourse.update !== 'function') {
      logger.error(`Invalid transcript course instance for id: ${id}`);
      return res.status(500).json({ message: "Invalid transcript course instance" });
    }
    
    await transcriptCourse.update(req.body);
    
    // Update transcript status after course update
    await updateTranscriptStatus(transcriptCourse.universityTranscriptId);
    
    const updatedCourse = await TranscriptCourse.findByPk(id, {
      include: [
        { model: UniversityTranscript },
        { model: UniversityCourse },
          { model: Course, as: 'course' },
        { model: Semester },
      ],
    });
    
    if (!updatedCourse) {
      logger.warn(`Updated transcript course not found with id: ${id}`);
      return res.status(404).json({ message: "Updated course not found" });
    }
    
    logger.info(`Transcript course ${id} updated successfully`);
    // Ensure we return a plain object (get() converts Sequelize instance to plain object)
    res.json(updatedCourse.get ? updatedCourse.get({ plain: true }) : updatedCourse);
  } catch (error) {
    logger.error(`Error updating transcript course ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

// Delete a TranscriptCourse
exports.delete = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Attempting to delete transcript course: ${id}`);
    const transcriptCourse = await TranscriptCourse.findByPk(id);
    if (!transcriptCourse) {
      logger.warn(`Transcript course not found with id: ${id}`);
      return res.status(404).json({ message: "Transcript Course not found" });
    }
    const transcriptId = transcriptCourse.universityTranscriptId;
    await transcriptCourse.destroy();
    
    // Update transcript status after course deletion
    await updateTranscriptStatus(transcriptId);
    
    logger.info(`Transcript course ${id} deleted successfully`);
    res.json({ message: "Transcript Course deleted successfully" });
  } catch (error) {
    logger.error(`Error deleting transcript course ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

export default exports;
