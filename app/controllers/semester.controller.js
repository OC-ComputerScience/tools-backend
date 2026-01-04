import db from "../models/index.js";
import logger from "../config/logger.js";

const Semester = db.Semester;
const Op = db.Sequelize.Op;

const exports = {};

// Create and Save a new Semester
exports.create = (req, res) => {
  // Validate request
  if (!req.body.name || !req.body.startDate || !req.body.endDate) {
    logger.warn("Semester creation attempt with missing required fields");
    res.status(400).send({
      message: "Content can not be empty!",
    });
    return;
  }

  // Create a Semester
  const semester = {
    name: req.body.name,
    startDate: req.body.startDate,
    endDate: req.body.endDate,
  };

  logger.debug(`Creating semester: ${semester.name}`);

  // Save Semester in the database
  Semester.create(semester)
    .then((data) => {
      logger.info(`Semester created successfully: ${data.id} - ${data.name}`);
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error creating semester: ${err.message}`);
      res.status(500).send({
        message:
          err.message || "Some error occurred while creating the Semester.",
      });
    });
};

// Retrieve all Semesters from the database
exports.findAll = (req, res) => {
  logger.debug("Fetching all semesters");

  Semester.findAll()
    .then((data) => {
      logger.info(`Retrieved ${data.length} semesters`);
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error retrieving semesters: ${err.message}`);
      res.status(500).send({
        message:
          err.message || "Some error occurred while retrieving semesters.",
      });
    });
};

// Find a single Semester with an id
exports.findOne = (req, res) => {
  const id = req.params.id;

  logger.debug(`Finding semester with id: ${id}`);

  Semester.findByPk(id)
    .then((data) => {
      if (data) {
        logger.info(`Semester found: ${id}`);
        res.send(data);
      } else {
        logger.warn(`Semester not found with id: ${id}`);
        res.status(404).send({
          message: `Cannot find Semester with id=${id}.`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error retrieving semester ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error retrieving Semester with id=" + id,
      });
    });
};

// Update a Semester by the id
exports.update = (req, res) => {
  const id = req.params.id;

  logger.debug(`Updating semester ${id} with data: ${JSON.stringify(req.body)}`);

  Semester.update(req.body, {
    where: { id: id },
  })
    .then((num) => {
      if (num == 1) {
        logger.info(`Semester ${id} updated successfully`);
        res.send({
          message: "Semester was updated successfully.",
        });
      } else {
        logger.warn(`Failed to update semester ${id} - not found or empty body`);
        res.send({
          message: `Cannot update Semester with id=${id}. Maybe Semester was not found or req.body is empty!`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error updating semester ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error updating Semester with id=" + id,
      });
    });
};

// Delete a Semester with the specified id
exports.delete = (req, res) => {
  const id = req.params.id;

  logger.debug(`Attempting to delete semester: ${id}`);

  Semester.destroy({
    where: { id: id },
  })
    .then((num) => {
      if (num == 1) {
        logger.info(`Semester ${id} deleted successfully`);
        res.send({
          message: "Semester was deleted successfully!",
        });
      } else {
        logger.warn(`Cannot delete semester ${id} - not found`);
        res.send({
          message: `Cannot delete Semester with id=${id}. Maybe Semester was not found!`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error deleting semester ${id}: ${err.message}`);
      res.status(500).send({
        message: "Could not delete Semester with id=" + id,
      });
    });
};

export default exports;
