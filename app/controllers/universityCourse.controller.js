import db from "../models/index.js";
import logger from "../config/logger.js";

const UniversityCourse = db.UniversityCourse;
const University = db.University;

const exports = {};

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

export default exports;
