import db from "../models/index.js";
import logger from "../config/logger.js";

const UniversityOutcome = db.UniversityOutcome;
const University = db.University;

const exports = {};

const includeUniversity = [{ model: University }];

exports.create = async (req, res) => {
  try {
    logger.debug(`Creating university outcome with data: ${JSON.stringify(req.body)}`);
    const universityOutcome = await UniversityOutcome.create(req.body);
    const created = await UniversityOutcome.findByPk(universityOutcome.id, {
      include: includeUniversity,
    });
    logger.info(`University outcome created successfully: ${universityOutcome.id}`);
    res.status(201).json(created);
  } catch (error) {
    logger.error(`Error creating university outcome: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

exports.findAll = async (req, res) => {
  try {
    logger.debug("Fetching all university outcomes");
    const universityOutcomes = await UniversityOutcome.findAll({
      include: includeUniversity,
      order: [["number", "ASC"], ["name", "ASC"]],
    });
    logger.info(`Retrieved ${universityOutcomes.length} university outcomes`);
    res.json(universityOutcomes);
  } catch (error) {
    logger.error(`Error retrieving university outcomes: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

exports.findAllforUniversity = async (req, res) => {
  const universityId = req.params.universityId;
  try {
    logger.debug(`Fetching university outcomes for university: ${universityId}`);
    const universityOutcomes = await UniversityOutcome.findAll({
      where: { universityId },
      include: includeUniversity,
      order: [["number", "ASC"], ["name", "ASC"]],
    });
    logger.info(`Retrieved ${universityOutcomes.length} university outcomes for university: ${universityId}`);
    res.json(universityOutcomes);
  } catch (error) {
    logger.error(`Error retrieving university outcomes for university ${universityId}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

exports.findOne = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Finding university outcome with id: ${id}`);
    const universityOutcome = await UniversityOutcome.findByPk(id, {
      include: includeUniversity,
    });
    if (!universityOutcome) {
      logger.warn(`University outcome not found with id: ${id}`);
      return res.status(404).json({ message: "University Outcome not found" });
    }
    logger.info(`University outcome found: ${id}`);
    res.json(universityOutcome);
  } catch (error) {
    logger.error(`Error retrieving university outcome ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Updating university outcome ${id} with data: ${JSON.stringify(req.body)}`);
    const universityOutcome = await UniversityOutcome.findByPk(id);
    if (!universityOutcome) {
      logger.warn(`University outcome not found with id: ${id}`);
      return res.status(404).json({ message: "University Outcome not found" });
    }
    await universityOutcome.update(req.body);
    const updated = await UniversityOutcome.findByPk(id, {
      include: includeUniversity,
    });
    logger.info(`University outcome ${id} updated successfully`);
    res.json(updated);
  } catch (error) {
    logger.error(`Error updating university outcome ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

exports.delete = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Attempting to delete university outcome: ${id}`);
    const universityOutcome = await UniversityOutcome.findByPk(id);
    if (!universityOutcome) {
      logger.warn(`University outcome not found with id: ${id}`);
      return res.status(404).json({ message: "University Outcome not found" });
    }
    await universityOutcome.destroy();
    logger.info(`University outcome ${id} deleted successfully`);
    res.json({ message: "University Outcome deleted successfully" });
  } catch (error) {
    logger.error(`Error deleting university outcome ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

export default exports;
