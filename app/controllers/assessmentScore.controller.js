import db from "../models/index.js";
import logger from "../config/logger.js";

const AssessmentScore = db.AssessmentScore;

const exports = {};

const numberOrNull = (value) => {
  if (value === "" || value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

exports.create = async (req, res) => {
  try {
    const score = numberOrNull(req.body.score);
    const percentage = numberOrNull(req.body.percentage);
    if (score == null || percentage == null) {
      return res.status(400).json({ message: "Score and percentage are required" });
    }
    logger.debug(`Creating assessment score: ${score}, ${percentage}`);
    const assessmentScore = await AssessmentScore.create({
      score,
      percentage,
      description: String(req.body.description || "").trim() || null,
    });
    logger.info(`Assessment score created successfully: ${assessmentScore.id}`);
    res.status(201).json(assessmentScore);
  } catch (error) {
    logger.error(`Error creating assessment score: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

exports.findAll = async (req, res) => {
  try {
    logger.debug("Fetching all assessment scores");
    const assessmentScores = await AssessmentScore.findAll({
      order: [["id", "ASC"]],
    });
    logger.info(`Retrieved ${assessmentScores.length} assessment scores`);
    res.json(assessmentScores);
  } catch (error) {
    logger.error(`Error retrieving assessment scores: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

exports.findOne = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Finding assessment score with id: ${id}`);
    const assessmentScore = await AssessmentScore.findByPk(id);
    if (!assessmentScore) {
      logger.warn(`Assessment score not found with id: ${id}`);
      return res.status(404).json({ message: "Assessment score not found" });
    }
    logger.info(`Assessment score found: ${id}`);
    res.json(assessmentScore);
  } catch (error) {
    logger.error(`Error retrieving assessment score ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  const id = req.params.id;
  try {
    const score = numberOrNull(req.body.score);
    const percentage = numberOrNull(req.body.percentage);
    if (score == null || percentage == null) {
      return res.status(400).json({ message: "Score and percentage are required" });
    }
    logger.debug(`Updating assessment score ${id}`);
    const assessmentScore = await AssessmentScore.findByPk(id);
    if (!assessmentScore) {
      logger.warn(`Assessment score not found with id: ${id}`);
      return res.status(404).json({ message: "Assessment score not found" });
    }
    await assessmentScore.update({
      score,
      percentage,
      description: String(req.body.description || "").trim() || null,
    });
    logger.info(`Assessment score ${id} updated successfully`);
    res.json(assessmentScore);
  } catch (error) {
    logger.error(`Error updating assessment score ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

exports.delete = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Attempting to delete assessment score: ${id}`);
    const assessmentScore = await AssessmentScore.findByPk(id);
    if (!assessmentScore) {
      logger.warn(`Assessment score not found with id: ${id}`);
      return res.status(404).json({ message: "Assessment score not found" });
    }
    await assessmentScore.destroy();
    logger.info(`Assessment score ${id} deleted successfully`);
    res.json({ message: "Assessment score deleted successfully" });
  } catch (error) {
    logger.error(`Error deleting assessment score ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

export default exports;
