import db from "../models/index.js";
import logger from "../config/logger.js";

const Assignment = db.Assignment;
const Department = db.Department;
const University = db.University;
const Course = db.course;
const DepartmentOutcome = db.DepartmentOutcome;
const UniversityOutcome = db.UniversityOutcome;

const exports = {};

const includeRelations = [
  {
    model: Department,
    include: [{ model: University }],
  },
  { model: Course, as: "course" },
  { model: DepartmentOutcome },
  { model: UniversityOutcome },
];

const assignmentFields = (body) => {
  const coreAssessment = Boolean(body.coreAssessment);
  return {
    departmentId: body.departmentId,
    courseId: body.courseId,
    name: body.name,
    totalPoints: body.totalPoints === "" || body.totalPoints == null ? null : body.totalPoints,
    description: body.description || null,
    coreAssessment,
    departmentOutcomeId: coreAssessment ? null : body.departmentOutcomeId || null,
    universityOutcomeId: coreAssessment ? body.universityOutcomeId || null : null,
  };
};

exports.create = async (req, res) => {
  try {
    logger.debug(`Creating assignment with data: ${JSON.stringify(req.body)}`);
    const assignment = await Assignment.create(assignmentFields(req.body));
    const created = await Assignment.findByPk(assignment.id, {
      include: includeRelations,
    });
    logger.info(`Assignment created successfully: ${assignment.id}`);
    res.status(201).json(created);
  } catch (error) {
    logger.error(`Error creating assignment: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

exports.findAll = async (req, res) => {
  try {
    logger.debug("Fetching all assignments");
    const assignments = await Assignment.findAll({
      include: includeRelations,
      order: [["name", "ASC"]],
    });
    logger.info(`Retrieved ${assignments.length} assignments`);
    res.json(assignments);
  } catch (error) {
    logger.error(`Error retrieving assignments: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

exports.findAllforDepartment = async (req, res) => {
  const departmentId = req.params.departmentId;
  try {
    logger.debug(`Fetching assignments for department: ${departmentId}`);
    const assignments = await Assignment.findAll({
      where: { departmentId },
      include: includeRelations,
      order: [["name", "ASC"]],
    });
    logger.info(`Retrieved ${assignments.length} assignments for department: ${departmentId}`);
    res.json(assignments);
  } catch (error) {
    logger.error(`Error retrieving assignments for department ${departmentId}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

exports.findOne = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Finding assignment with id: ${id}`);
    const assignment = await Assignment.findByPk(id, {
      include: includeRelations,
    });
    if (!assignment) {
      logger.warn(`Assignment not found with id: ${id}`);
      return res.status(404).json({ message: "Assignment not found" });
    }
    logger.info(`Assignment found: ${id}`);
    res.json(assignment);
  } catch (error) {
    logger.error(`Error retrieving assignment ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Updating assignment ${id} with data: ${JSON.stringify(req.body)}`);
    const assignment = await Assignment.findByPk(id);
    if (!assignment) {
      logger.warn(`Assignment not found with id: ${id}`);
      return res.status(404).json({ message: "Assignment not found" });
    }
    await assignment.update(assignmentFields(req.body));
    const updated = await Assignment.findByPk(id, {
      include: includeRelations,
    });
    logger.info(`Assignment ${id} updated successfully`);
    res.json(updated);
  } catch (error) {
    logger.error(`Error updating assignment ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

exports.delete = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Attempting to delete assignment: ${id}`);
    const assignment = await Assignment.findByPk(id);
    if (!assignment) {
      logger.warn(`Assignment not found with id: ${id}`);
      return res.status(404).json({ message: "Assignment not found" });
    }
    await assignment.destroy();
    logger.info(`Assignment ${id} deleted successfully`);
    res.json({ message: "Assignment deleted successfully" });
  } catch (error) {
    logger.error(`Error deleting assignment ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

export default exports;
