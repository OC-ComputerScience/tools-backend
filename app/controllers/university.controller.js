import db from "../models/index.js";
import logger from "../config/logger.js";

const University = db.University;

const exports = {};

// Create a new University
exports.create = async (req, res) => {
  try {
    logger.debug(`Creating university with data: ${JSON.stringify(req.body)}`);
    const university = await University.create(req.body);
    logger.info(`University created successfully: ${university.id}`);
    res.status(201).json(university);
  } catch (error) {
    logger.error(`Error creating university: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

// Get all Universities
exports.findAll = async (req, res) => {
  try {
    logger.debug("Fetching all universities");
    const universities = await University.findAll();
    logger.info(`Retrieved ${universities.length} universities`);
    res.json(universities);
  } catch (error) {
    logger.error(`Error retrieving universities: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

// Get a single University by id
exports.findOne = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Finding university with id: ${id}`);
    const university = await University.findByPk(id);
    if (!university) {
      logger.warn(`University not found with id: ${id}`);
      return res.status(404).json({ message: "University not found" });
    }
    logger.info(`University found: ${id}`);
    res.json(university);
  } catch (error) {
    logger.error(`Error retrieving university ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

// Update a University
exports.update = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Updating university ${id} with data: ${JSON.stringify(req.body)}`);
    const university = await University.findByPk(id);
    if (!university) {
      logger.warn(`University not found with id: ${id}`);
      return res.status(404).json({ message: "University not found" });
    }
    await university.update(req.body);
    logger.info(`University ${id} updated successfully`);
    res.json(university);
  } catch (error) {
    logger.error(`Error updating university ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

// Delete a University
exports.delete = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Attempting to delete university: ${id}`);
    const university = await University.findByPk(id);
    if (!university) {
      logger.warn(`University not found with id: ${id}`);
      return res.status(404).json({ message: "University not found" });
    }
    await university.destroy();
    logger.info(`University ${id} deleted successfully`);
    res.json({ message: "University deleted successfully" });
  } catch (error) {
    logger.error(`Error deleting university ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

export default exports;
