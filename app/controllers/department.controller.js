import db from "../models/index.js";
import logger from "../config/logger.js";

const Department = db.Department;
const University = db.University;
const College = db.College;
const User = db.user;

const exports = {};

const includeRelations = [
  { model: University },
  { model: College },
  { model: User, as: "chair", attributes: ["id", "fName", "lName", "email"] },
];

const assessmentWeightFrom = (value) => {
  if (value === "" || value == null) return null;
  const weight = Number(value);
  if (!Number.isInteger(weight) || weight < 0 || weight > 100) {
    return { error: "Assessment weight must be a whole number from 0 to 100" };
  }
  return weight;
};

exports.create = async (req, res) => {
  try {
    const assessmentWeight = assessmentWeightFrom(req.body.assessmentWeight);
    if (assessmentWeight?.error) {
      return res.status(400).json({ message: assessmentWeight.error });
    }
    logger.debug(`Creating department with data: ${JSON.stringify(req.body)}`);
    const department = await Department.create({ ...req.body, assessmentWeight });
    const created = await Department.findByPk(department.id, {
      include: includeRelations,
    });
    logger.info(`Department created successfully: ${department.id}`);
    res.status(201).json(created);
  } catch (error) {
    logger.error(`Error creating department: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

exports.findAll = async (req, res) => {
  try {
    logger.debug("Fetching all departments");
    const departments = await Department.findAll({
      include: includeRelations,
      order: [["code", "ASC"], ["name", "ASC"]],
    });
    logger.info(`Retrieved ${departments.length} departments`);
    res.json(departments);
  } catch (error) {
    logger.error(`Error retrieving departments: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

exports.findAllforUniversity = async (req, res) => {
  const universityId = req.params.universityId;
  try {
    logger.debug(`Fetching departments for university: ${universityId}`);
    const departments = await Department.findAll({
      where: { universityId },
      include: includeRelations,
      order: [["code", "ASC"], ["name", "ASC"]],
    });
    logger.info(`Retrieved ${departments.length} departments for university: ${universityId}`);
    res.json(departments);
  } catch (error) {
    logger.error(`Error retrieving departments for university ${universityId}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

exports.findOne = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Finding department with id: ${id}`);
    const department = await Department.findByPk(id, {
      include: includeRelations,
    });
    if (!department) {
      logger.warn(`Department not found with id: ${id}`);
      return res.status(404).json({ message: "Department not found" });
    }
    logger.info(`Department found: ${id}`);
    res.json(department);
  } catch (error) {
    logger.error(`Error retrieving department ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  const id = req.params.id;
  try {
    const assessmentWeight = assessmentWeightFrom(req.body.assessmentWeight);
    if (assessmentWeight?.error) {
      return res.status(400).json({ message: assessmentWeight.error });
    }
    logger.debug(`Updating department ${id} with data: ${JSON.stringify(req.body)}`);
    const department = await Department.findByPk(id);
    if (!department) {
      logger.warn(`Department not found with id: ${id}`);
      return res.status(404).json({ message: "Department not found" });
    }
    await department.update({ ...req.body, assessmentWeight });
    const updated = await Department.findByPk(id, {
      include: includeRelations,
    });
    logger.info(`Department ${id} updated successfully`);
    res.json(updated);
  } catch (error) {
    logger.error(`Error updating department ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

exports.delete = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Attempting to delete department: ${id}`);
    const department = await Department.findByPk(id);
    if (!department) {
      logger.warn(`Department not found with id: ${id}`);
      return res.status(404).json({ message: "Department not found" });
    }
    await department.destroy();
    logger.info(`Department ${id} deleted successfully`);
    res.json({ message: "Department deleted successfully" });
  } catch (error) {
    logger.error(`Error deleting department ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

export default exports;
