import db  from "../models/index.js";
import logger from "../config/logger.js";

const Term = db.term;
const Op = db.Sequelize.Op;
const exports = {};

// Create and Save a new Term
exports.create = (req, res) => {
  if (!req.body.termName) {
    logger.warn('Term creation attempt with empty termName');
    res.status(400).send({
      message: "Term name can not be empty!",
    });
    return;
  }

  const term = {
    termName: req.body.termName,
    startDate: req.body.startDate || null,
  };

  logger.debug(`Creating term: ${term.termName}`);

  Term.create(term)
    .then((data) => {
      logger.info(`Term created successfully: ${data.id} - ${data.termName}`);
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error creating term: ${err.message}`);
      res.status(500).send({
        message: err.message || "Some error occurred while creating the Term.",
      });
    });
};

// Retrieve all Terms from the database
exports.findAll = (req, res) => {
  logger.debug('Fetching all terms');

  Term.findAll()
    .then((data) => {
      logger.info(`Retrieved ${data.length} terms`);
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error retrieving terms: ${err.message}`);
      res.status(500).send({
        message: err.message || "Some error occurred while retrieving terms.",
      });
    });
};

// Find a single Term with an id
exports.findOne = (req, res) => {
  const id = req.params.id;
  logger.debug(`Finding term with id: ${id}`);

  Term.findByPk(id)
    .then((data) => {
      if (data) {
        logger.info(`Term found: ${id}`);
        res.send(data);
      } else {
        logger.warn(`Term not found with id: ${id}`);
        res.status(404).send({
          message: `Cannot find Term with id=${id}.`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error retrieving term ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error retrieving Term with id=" + id,
      });
    });
};

// Update a Term by the id in the request
exports.update = (req, res) => {
  const id = req.params.id;

  logger.debug(`Updating term ${id} with data: ${JSON.stringify(req.body)}`);

  Term.update(req.body, {
    where: { id: id },
  })
    .then((num) => {
      if (num == 1) {
        logger.info(`Term ${id} updated successfully`);
        res.send({
          message: "Term was updated successfully.",
        });
      } else {
        logger.warn(`Failed to update term ${id} - not found or empty body`);
        res.send({
          message: `Cannot update Term with id=${id}. Maybe Term was not found or req.body is empty!`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error updating term ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error updating Term with id=" + id,
      });
    });
};

// Delete a Term with the specified id in the request
exports.delete = (req, res) => {
  const id = req.params.id;

  logger.debug(`Attempting to delete term: ${id}`);

  Term.destroy({
    where: { id: id },
  })
    .then((num) => {
      if (num == 1) {
        logger.info(`Term ${id} deleted successfully`);
        res.send({
          message: "Term was deleted successfully!",
        });
      } else {
        logger.warn(`Cannot delete term ${id} - not found`);
        res.send({
          message: `Cannot delete Term with id=${id}. Maybe Term was not found!`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error deleting term ${id}: ${err.message}`);
      res.status(500).send({
        message: "Could not delete Term with id=" + id,
      });
    });
};

export default exports;

