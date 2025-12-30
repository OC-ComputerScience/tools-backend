import db from "../models/index.js";
import logger from "../config/logger.js";

const Major = db.major;
const Op = db.Sequelize.Op;
const exports = {};

// Create and Save a new Major
exports.create = (req, res) => {
  if (!req.body.code || !req.body.description) {
    logger.warn("Major creation attempt with missing required fields");
    res.status(400).send({
      message: "Code and description are required!",
    });
    return;
  }

  const major = {
    code: req.body.code,
    description: req.body.description,
  };

  logger.debug(`Creating major: ${major.code}`);

  Major.create(major)
    .then((data) => {
      logger.info(`Major created successfully: ${data.id} - ${data.code}`);
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error creating major: ${err.message}`);
      res.status(500).send({
        message: err.message || "Some error occurred while creating the Major.",
      });
    });
};

// Retrieve all Majors from the database
exports.findAll = (req, res) => {
  logger.debug("Fetching all majors");

  Major.findAll({
    order: [["code", "ASC"]],
  })
    .then((data) => {
      logger.info(`Retrieved ${data.length} majors`);
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error retrieving majors: ${err.message}`);
      res.status(500).send({
        message: err.message || "Some error occurred while retrieving majors.",
      });
    });
};

// Find a single Major with an id
exports.findOne = (req, res) => {
  const id = req.params.id;
  logger.debug(`Finding major with id: ${id}`);

  Major.findByPk(id)
    .then((data) => {
      if (data) {
        logger.info(`Major found: ${id}`);
        res.send(data);
      } else {
        logger.warn(`Major not found with id: ${id}`);
        res.status(404).send({
          message: `Cannot find Major with id=${id}.`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error retrieving major ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error retrieving Major with id=" + id,
      });
    });
};

// Update a Major by the id in the request
exports.update = (req, res) => {
  const id = req.params.id;

  logger.debug(`Updating major ${id} with data: ${JSON.stringify(req.body)}`);

  Major.update(req.body, {
    where: { id: id },
  })
    .then((num) => {
      if (num == 1) {
        logger.info(`Major ${id} updated successfully`);
        res.send({
          message: "Major was updated successfully.",
        });
      } else {
        logger.warn(
          `Failed to update major ${id} - not found or empty body`
        );
        res.send({
          message: `Cannot update Major with id=${id}. Maybe Major was not found or req.body is empty!`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error updating major ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error updating Major with id=" + id,
      });
    });
};

// Delete a Major with the specified id in the request
exports.delete = (req, res) => {
  const id = req.params.id;

  logger.debug(`Attempting to delete major: ${id}`);

  Major.destroy({
    where: { id: id },
  })
    .then((num) => {
      if (num == 1) {
        logger.info(`Major ${id} deleted successfully`);
        res.send({
          message: "Major was deleted successfully!",
        });
      } else {
        logger.warn(`Cannot delete major ${id} - not found`);
        res.send({
          message: `Cannot delete Major with id=${id}. Maybe Major was not found!`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error deleting major ${id}: ${err.message}`);
      res.status(500).send({
        message: "Could not delete Major with id=" + id,
      });
    });
};

export default exports;

