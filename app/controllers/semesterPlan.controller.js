import db from "../models/index.js";
import logger from "../config/logger.js";

const SemesterPlan = db.semesterPlan;
const Major = db.major;
const Course = db.course;
const Op = db.Sequelize.Op;
const exports = {};

// Create and Save a new SemesterPlan
exports.create = (req, res) => {
  if (!req.body.majorId || !req.body.semesterNumber || !req.body.courseId) {
    logger.warn("SemesterPlan creation attempt with missing required fields");
    res.status(400).send({
      message: "Major ID, semester number, and course ID are required!",
    });
    return;
  }

  const semesterPlan = {
    majorId: req.body.majorId,
    semesterNumber: req.body.semesterNumber,
    courseId: req.body.courseId,
  };

  logger.debug(
    `Creating semester plan: Major ${semesterPlan.majorId}, Semester ${semesterPlan.semesterNumber}, Course ${semesterPlan.courseId}`
  );

  SemesterPlan.create(semesterPlan)
    .then((data) => {
      logger.info(
        `SemesterPlan created successfully: ${data.id} - Major ${data.majorId}, Semester ${data.semesterNumber}`
      );
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error creating semester plan: ${err.message}`);
      res.status(500).send({
        message:
          err.message ||
          "Some error occurred while creating the SemesterPlan.",
      });
    });
};

// Retrieve all SemesterPlans from the database
exports.findAll = (req, res) => {
  const majorId = req.query.majorId;
  const semesterNumber = req.query.semesterNumber;

  let condition = {};
  if (majorId) condition.majorId = majorId;
  if (semesterNumber) condition.semesterNumber = semesterNumber;

  logger.debug(
    `Fetching semester plans with condition: ${JSON.stringify(condition)}`
  );

  SemesterPlan.findAll({
    where: condition,
    order: [
      ["majorId", "ASC"],
      ["semesterNumber", "ASC"],
      ["courseId", "ASC"],
    ],
    include: [
      { model: Major, as: "major" },
      { model: Course, as: "course" },
    ],
  })
    .then((data) => {
      logger.info(`Retrieved ${data.length} semester plans`);
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error retrieving semester plans: ${err.message}`);
      res.status(500).send({
        message:
          err.message || "Some error occurred while retrieving semester plans.",
      });
    });
};

// Find a single SemesterPlan with an id
exports.findOne = (req, res) => {
  const id = req.params.id;
  logger.debug(`Finding semester plan with id: ${id}`);

  SemesterPlan.findByPk(id, {
    include: [
      { model: Major, as: "major" },
      { model: Course, as: "course" },
    ],
  })
    .then((data) => {
      if (data) {
        logger.info(`SemesterPlan found: ${id}`);
        res.send(data);
      } else {
        logger.warn(`SemesterPlan not found with id: ${id}`);
        res.status(404).send({
          message: `Cannot find SemesterPlan with id=${id}.`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error retrieving semester plan ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error retrieving SemesterPlan with id=" + id,
      });
    });
};

// Update a SemesterPlan by the id in the request
exports.update = (req, res) => {
  const id = req.params.id;

  logger.debug(
    `Updating semester plan ${id} with data: ${JSON.stringify(req.body)}`
  );

  SemesterPlan.update(req.body, {
    where: { id: id },
  })
    .then((num) => {
      if (num == 1) {
        logger.info(`SemesterPlan ${id} updated successfully`);
        res.send({
          message: "SemesterPlan was updated successfully.",
        });
      } else {
        logger.warn(
          `Failed to update semester plan ${id} - not found or empty body`
        );
        res.send({
          message: `Cannot update SemesterPlan with id=${id}. Maybe SemesterPlan was not found or req.body is empty!`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error updating semester plan ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error updating SemesterPlan with id=" + id,
      });
    });
};

// Delete a SemesterPlan with the specified id in the request
exports.delete = (req, res) => {
  const id = req.params.id;

  logger.debug(`Attempting to delete semester plan: ${id}`);

  SemesterPlan.destroy({
    where: { id: id },
  })
    .then((num) => {
      if (num == 1) {
        logger.info(`SemesterPlan ${id} deleted successfully`);
        res.send({
          message: "SemesterPlan was deleted successfully!",
        });
      } else {
        logger.warn(`Cannot delete semester plan ${id} - not found`);
        res.send({
          message: `Cannot delete SemesterPlan with id=${id}. Maybe SemesterPlan was not found!`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error deleting semester plan ${id}: ${err.message}`);
      res.status(500).send({
        message: "Could not delete SemesterPlan with id=" + id,
      });
    });
};

export default exports;




