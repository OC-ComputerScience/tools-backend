import db from "../models/index.js";
import logger from "../config/logger.js";

const Course = db.course;
const Op = db.Sequelize.Op;
const exports = {};

// Create and Save a new Course
exports.create = (req, res) => {
  if (!req.body.code || !req.body.number || !req.body.description) {
    logger.warn("Course creation attempt with missing required fields");
    res.status(400).send({
      message: "Code, number, and description are required!",
    });
    return;
  }

  const course = {
    code: req.body.code,
    number: req.body.number,
    description: req.body.description,
  };

  logger.debug(`Creating course: ${course.code} ${course.number}`);

  Course.create(course)
    .then((data) => {
      logger.info(
        `Course created successfully: ${data.id} - ${data.code} ${data.number}`
      );
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error creating course: ${err.message}`);
      res.status(500).send({
        message:
          err.message || "Some error occurred while creating the Course.",
      });
    });
};

// Retrieve all Courses from the database
exports.findAll = (req, res) => {
  logger.debug("Fetching all courses");

  Course.findAll({
    order: [
      ["code", "ASC"],
      ["number", "ASC"],
    ],
  })
    .then((data) => {
      logger.info(`Retrieved ${data.length} courses`);
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error retrieving courses: ${err.message}`);
      res.status(500).send({
        message: err.message || "Some error occurred while retrieving courses.",
      });
    });
};

// Find a single Course with an id
exports.findOne = (req, res) => {
  const id = req.params.id;
  logger.debug(`Finding course with id: ${id}`);

  Course.findByPk(id)
    .then((data) => {
      if (data) {
        logger.info(`Course found: ${id}`);
        res.send(data);
      } else {
        logger.warn(`Course not found with id: ${id}`);
        res.status(404).send({
          message: `Cannot find Course with id=${id}.`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error retrieving course ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error retrieving Course with id=" + id,
      });
    });
};

// Update a Course by the id in the request
exports.update = (req, res) => {
  const id = req.params.id;

  logger.debug(
    `Updating course ${id} with data: ${JSON.stringify(req.body)}`
  );

  Course.update(req.body, {
    where: { id: id },
  })
    .then((num) => {
      if (num == 1) {
        logger.info(`Course ${id} updated successfully`);
        res.send({
          message: "Course was updated successfully.",
        });
      } else {
        logger.warn(
          `Failed to update course ${id} - not found or empty body`
        );
        res.send({
          message: `Cannot update Course with id=${id}. Maybe Course was not found or req.body is empty!`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error updating course ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error updating Course with id=" + id,
      });
    });
};

// Delete a Course with the specified id in the request
exports.delete = (req, res) => {
  const id = req.params.id;

  logger.debug(`Attempting to delete course: ${id}`);

  Course.destroy({
    where: { id: id },
  })
    .then((num) => {
      if (num == 1) {
        logger.info(`Course ${id} deleted successfully`);
        res.send({
          message: "Course was deleted successfully!",
        });
      } else {
        logger.warn(`Cannot delete course ${id} - not found`);
        res.send({
          message: `Cannot delete Course with id=${id}. Maybe Course was not found!`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error deleting course ${id}: ${err.message}`);
      res.status(500).send({
        message: "Could not delete Course with id=" + id,
      });
    });
};

export default exports;
