import db from "../models/index.js";
import logger from "../config/logger.js";

const University = db.University;
const UniversityTranscript = db.UniversityTranscript;
const TranscriptCourse = db.TranscriptCourse;

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

// Create a new UniversityTranscript
exports.create = async (req, res) => {
  try {
    logger.debug(`Creating university transcript with data: ${JSON.stringify(req.body)}`);
    const transcriptData = {
      ...req.body,
      status: req.body.status || "Not Process"
    };
    const universityTranscript = await UniversityTranscript.create(transcriptData);
    logger.info(`University transcript created successfully: ${universityTranscript.id}`);
    res.status(201).json(universityTranscript);
  } catch (error) {
    logger.error(`Error creating university transcript: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

// Get all UniversityTranscripts
exports.findAll = async (req, res) => {
  try {
    logger.debug("Fetching all university transcripts");
    const universityTranscripts = await UniversityTranscript.findAll({
      include: [{ model: University }, { model: TranscriptCourse }],
    });
    logger.info(`Retrieved ${universityTranscripts.length} university transcripts`);
    res.json(universityTranscripts);
  } catch (error) {
    logger.error(`Error retrieving university transcripts: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

// Get a single UniversityTranscript by id
exports.findOne = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Finding university transcript with id: ${id}`);
    const universityTranscript = await UniversityTranscript.findByPk(
      id,
      {
        include: [{ model: University }, { model: TranscriptCourse }],
      }
    );
    if (!universityTranscript) {
      logger.warn(`University transcript not found with id: ${id}`);
      return res
        .status(404)
        .json({ message: "University Transcript not found" });
    }
    logger.info(`University transcript found: ${id}`);
    res.json(universityTranscript);
  } catch (error) {
    logger.error(`Error retrieving university transcript ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

// Update a UniversityTranscript
exports.update = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Updating university transcript ${id} with data: ${JSON.stringify(req.body)}`);
    const universityTranscript = await UniversityTranscript.findByPk(id);
    if (!universityTranscript) {
      logger.warn(`University transcript not found with id: ${id}`);
      return res
        .status(404)
        .json({ message: "University Transcript not found" });
    }
    await universityTranscript.update(req.body);
    logger.info(`University transcript ${id} updated successfully`);
    res.json(universityTranscript);
  } catch (error) {
    logger.error(`Error updating university transcript ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

// Delete a UniversityTranscript
exports.delete = async (req, res) => {
  const { id } = req.params;

  try {
    logger.debug(`Attempting to delete university transcript: ${id}`);
    const transaction = await db.sequelize.transaction();

    try {
      // First, delete all associated transcript courses
      const transcriptCourses = await TranscriptCourse.findAll({
        where: { universityTranscriptId: id },
        transaction,
      });

      if (transcriptCourses.length > 0) {
        logger.debug(`Deleting ${transcriptCourses.length} associated transcript courses for transcript ${id}`);
        await TranscriptCourse.destroy({
          where: { universityTranscriptId: id },
          transaction,
        });
      }

      // Then delete the university transcript
      const deleted = await UniversityTranscript.destroy({
        where: { id: id },
        transaction,
      });

      if (deleted === 0) {
        await transaction.rollback();
        logger.warn(`University transcript not found with id: ${id}`);
        return res
          .status(404)
          .json({ message: "University transcript not found" });
      }

      await transaction.commit();
      logger.info(`University transcript ${id} and associated courses deleted successfully`);
      res.json({
        message:
          "University transcript and associated courses deleted successfully",
      });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    logger.error(`Error deleting university transcript ${id}: ${error.message}`);
    res.status(500).json({ message: "Error deleting university transcript" });
  }
};

export default exports;
