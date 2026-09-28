import db from "../models/index.js";
import logger from "../config/logger.js";

const DepartmentOutcome = db.DepartmentOutcome;
const Department = db.Department;
const University = db.University;
const UniversityOutcome = db.UniversityOutcome;

const exports = {};

const includeRelations = [
  {
    model: Department,
    include: [{ model: University }],
  },
  {
    model: UniversityOutcome,
    as: "universityOutcomes",
    through: { attributes: [] },
    include: [{ model: University }],
  },
];

const universityOutcomeIdsFromBody = (body) => {
  const rawIds = Array.isArray(body.universityOutcomeIds)
    ? body.universityOutcomeIds
    : body.universityOutcomeId
      ? [body.universityOutcomeId]
      : [];
  return [...new Set(rawIds.filter((id) => id != null && id !== "").map((id) => Number(id)))];
};

const fieldsFromBody = (body) => {
  const { universityOutcomeIds, universityOutcomeId, universityOutcomes, department, ...fields } = body;
  return fields;
};

exports.create = async (req, res) => {
  try {
    logger.debug(`Creating department outcome with data: ${JSON.stringify(req.body)}`);
    const departmentOutcome = await DepartmentOutcome.create(fieldsFromBody(req.body));
    await departmentOutcome.setUniversityOutcomes(universityOutcomeIdsFromBody(req.body));
    const created = await DepartmentOutcome.findByPk(departmentOutcome.id, {
      include: includeRelations,
    });
    logger.info(`Department outcome created successfully: ${departmentOutcome.id}`);
    res.status(201).json(created);
  } catch (error) {
    logger.error(`Error creating department outcome: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

exports.findAll = async (req, res) => {
  try {
    logger.debug("Fetching all department outcomes");
    const departmentOutcomes = await DepartmentOutcome.findAll({
      include: includeRelations,
      order: [["number", "ASC"], ["name", "ASC"]],
    });
    logger.info(`Retrieved ${departmentOutcomes.length} department outcomes`);
    res.json(departmentOutcomes);
  } catch (error) {
    logger.error(`Error retrieving department outcomes: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

exports.findAllforDepartment = async (req, res) => {
  const departmentId = req.params.departmentId;
  try {
    logger.debug(`Fetching department outcomes for department: ${departmentId}`);
    const departmentOutcomes = await DepartmentOutcome.findAll({
      where: { departmentId },
      include: includeRelations,
      order: [["number", "ASC"], ["name", "ASC"]],
    });
    logger.info(`Retrieved ${departmentOutcomes.length} department outcomes for department: ${departmentId}`);
    res.json(departmentOutcomes);
  } catch (error) {
    logger.error(`Error retrieving department outcomes for department ${departmentId}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

exports.findOne = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Finding department outcome with id: ${id}`);
    const departmentOutcome = await DepartmentOutcome.findByPk(id, {
      include: includeRelations,
    });
    if (!departmentOutcome) {
      logger.warn(`Department outcome not found with id: ${id}`);
      return res.status(404).json({ message: "Department Outcome not found" });
    }
    logger.info(`Department outcome found: ${id}`);
    res.json(departmentOutcome);
  } catch (error) {
    logger.error(`Error retrieving department outcome ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Updating department outcome ${id} with data: ${JSON.stringify(req.body)}`);
    const departmentOutcome = await DepartmentOutcome.findByPk(id);
    if (!departmentOutcome) {
      logger.warn(`Department outcome not found with id: ${id}`);
      return res.status(404).json({ message: "Department Outcome not found" });
    }
    await departmentOutcome.update(fieldsFromBody(req.body));
    await departmentOutcome.setUniversityOutcomes(universityOutcomeIdsFromBody(req.body));
    const updated = await DepartmentOutcome.findByPk(id, {
      include: includeRelations,
    });
    logger.info(`Department outcome ${id} updated successfully`);
    res.json(updated);
  } catch (error) {
    logger.error(`Error updating department outcome ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

exports.delete = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Attempting to delete department outcome: ${id}`);
    const departmentOutcome = await DepartmentOutcome.findByPk(id);
    if (!departmentOutcome) {
      logger.warn(`Department outcome not found with id: ${id}`);
      return res.status(404).json({ message: "Department Outcome not found" });
    }
    await departmentOutcome.destroy();
    logger.info(`Department outcome ${id} deleted successfully`);
    res.json({ message: "Department Outcome deleted successfully" });
  } catch (error) {
    logger.error(`Error deleting department outcome ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

export default exports;
