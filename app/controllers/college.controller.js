import db from "../models/index.js";
import logger from "../config/logger.js";

const College = db.College;
const University = db.University;
const User = db.user;

const exports = {};

const includeRelations = [
  { model: University },
  { model: User, as: "dean", attributes: ["id", "fName", "lName", "email"] },
];

const assessmentWeightFrom = (value) => {
  if (value === "" || value == null) return null;
  const weight = Number(value);
  if (!Number.isInteger(weight) || weight < 0 || weight > 100) {
    return { error: "Assessment weight must be a whole number from 0 to 100" };
  }
  return weight;
};

const collegePayload = (body) => {
  const assessmentWeight = assessmentWeightFrom(body.assessmentWeight);
  return {
    universityId: body.universityId,
    name: String(body.name || "").trim(),
    deanUserId: body.deanUserId || null,
    assessmentWeight,
  };
};

exports.create = async (req, res) => {
  try {
    const payload = collegePayload(req.body);
    if (payload.assessmentWeight?.error) {
      return res.status(400).json({ message: payload.assessmentWeight.error });
    }
    if (!payload.universityId || !payload.name) {
      return res.status(400).json({ message: "University and name are required" });
    }
    logger.debug(`Creating college: ${payload.name}`);
    const college = await College.create(payload);
    const created = await College.findByPk(college.id, {
      include: includeRelations,
    });
    logger.info(`College created successfully: ${college.id}`);
    res.status(201).json(created);
  } catch (error) {
    logger.error(`Error creating college: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

exports.findAll = async (req, res) => {
  try {
    logger.debug("Fetching all colleges");
    const colleges = await College.findAll({
      include: includeRelations,
      order: [["name", "ASC"]],
    });
    logger.info(`Retrieved ${colleges.length} colleges`);
    res.json(colleges);
  } catch (error) {
    logger.error(`Error retrieving colleges: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

exports.findOne = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Finding college with id: ${id}`);
    const college = await College.findByPk(id, {
      include: includeRelations,
    });
    if (!college) {
      logger.warn(`College not found with id: ${id}`);
      return res.status(404).json({ message: "College not found" });
    }
    logger.info(`College found: ${id}`);
    res.json(college);
  } catch (error) {
    logger.error(`Error retrieving college ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  const id = req.params.id;
  try {
    const payload = collegePayload(req.body);
    if (payload.assessmentWeight?.error) {
      return res.status(400).json({ message: payload.assessmentWeight.error });
    }
    if (!payload.universityId || !payload.name) {
      return res.status(400).json({ message: "University and name are required" });
    }
    logger.debug(`Updating college ${id}`);
    const college = await College.findByPk(id);
    if (!college) {
      logger.warn(`College not found with id: ${id}`);
      return res.status(404).json({ message: "College not found" });
    }
    await college.update(payload);
    const updated = await College.findByPk(id, {
      include: includeRelations,
    });
    logger.info(`College ${id} updated successfully`);
    res.json(updated);
  } catch (error) {
    logger.error(`Error updating college ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

exports.delete = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Attempting to delete college: ${id}`);
    const college = await College.findByPk(id);
    if (!college) {
      logger.warn(`College not found with id: ${id}`);
      return res.status(404).json({ message: "College not found" });
    }
    await college.destroy();
    logger.info(`College ${id} deleted successfully`);
    res.json({ message: "College deleted successfully" });
  } catch (error) {
    logger.error(`Error deleting college ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

export default exports;
