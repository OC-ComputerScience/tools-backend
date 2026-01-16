import db from "../models/index.js";
import logger from "../config/logger.js";

const PrefixKeyword = db.PrefixKeyword;
const Op = db.Sequelize.Op;
const exports = {};

// Create and Save a new PrefixKeyword
exports.create = (req, res) => {
  if (!req.body.prefix || !req.body.keywords) {
    logger.warn("PrefixKeyword creation attempt with missing required fields");
    res.status(400).send({
      message: "Prefix and keywords are required!",
    });
    return;
  }

  const prefixKeyword = {
    prefix: req.body.prefix.toUpperCase(),
    keywords: req.body.keywords,
  };

  logger.debug(`Creating prefixKeyword: ${prefixKeyword.prefix}`);

  PrefixKeyword.create(prefixKeyword)
    .then((data) => {
      logger.info(`PrefixKeyword created successfully: ${data.id} - ${data.prefix}`);
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error creating prefixKeyword: ${err.message}`);
      res.status(500).send({
        message: err.message || "Some error occurred while creating the PrefixKeyword.",
      });
    });
};

// Retrieve all PrefixKeywords from the database
exports.findAll = (req, res) => {
  logger.debug("Fetching all prefixKeywords");

  PrefixKeyword.findAll({
    order: [["prefix", "ASC"]],
  })
    .then((data) => {
      logger.info(`Retrieved ${data.length} prefixKeywords`);
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error retrieving prefixKeywords: ${err.message}`);
      res.status(500).send({
        message: err.message || "Some error occurred while retrieving prefixKeywords.",
      });
    });
};

// Find a single PrefixKeyword with an id
exports.findOne = (req, res) => {
  const id = req.params.id;
  logger.debug(`Finding prefixKeyword with id: ${id}`);

  PrefixKeyword.findByPk(id)
    .then((data) => {
      if (data) {
        logger.info(`PrefixKeyword found: ${id}`);
        res.send(data);
      } else {
        logger.warn(`PrefixKeyword not found with id: ${id}`);
        res.status(404).send({
          message: `Cannot find PrefixKeyword with id=${id}.`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error retrieving prefixKeyword ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error retrieving PrefixKeyword with id=" + id,
      });
    });
};

// Update a PrefixKeyword by the id in the request
exports.update = (req, res) => {
  const id = req.params.id;

  logger.debug(`Updating prefixKeyword ${id} with data: ${JSON.stringify(req.body)}`);

  const updateData = {
    ...req.body,
  };
  
  // Ensure prefix is uppercase
  if (updateData.prefix) {
    updateData.prefix = updateData.prefix.toUpperCase();
  }

  PrefixKeyword.update(updateData, {
    where: { id: id },
  })
    .then((num) => {
      if (num == 1) {
        logger.info(`PrefixKeyword ${id} updated successfully`);
        res.send({
          message: "PrefixKeyword was updated successfully.",
        });
      } else {
        logger.warn(
          `Failed to update prefixKeyword ${id} - not found or empty body`
        );
        res.send({
          message: `Cannot update PrefixKeyword with id=${id}. Maybe PrefixKeyword was not found or req.body is empty!`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error updating prefixKeyword ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error updating PrefixKeyword with id=" + id,
      });
    });
};

// Delete a PrefixKeyword with the specified id in the request
exports.delete = (req, res) => {
  const id = req.params.id;

  logger.debug(`Attempting to delete prefixKeyword: ${id}`);

  PrefixKeyword.destroy({
    where: { id: id },
  })
    .then((num) => {
      if (num == 1) {
        logger.info(`PrefixKeyword ${id} deleted successfully`);
        res.send({
          message: "PrefixKeyword was deleted successfully!",
        });
      } else {
        logger.warn(`Cannot delete prefixKeyword ${id} - not found`);
        res.send({
          message: `Cannot delete PrefixKeyword with id=${id}. Maybe PrefixKeyword was not found!`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error deleting prefixKeyword ${id}: ${err.message}`);
      res.status(500).send({
        message: "Could not delete PrefixKeyword with id=" + id,
      });
    });
};

export default exports;
