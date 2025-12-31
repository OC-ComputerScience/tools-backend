import db from "../models/index.js";
import logger from "../config/logger.js";

const Role = db.role;
const Op = db.Sequelize.Op;
const exports = {};

// Create and Save a new Role
exports.create = (req, res) => {
  if (!req.body.name || !req.body.description) {
    logger.warn("Role creation attempt with missing required fields");
    res.status(400).send({
      message: "Name and description are required!",
    });
    return;
  }

  const role = {
    name: req.body.name,
    description: req.body.description,
  };

  logger.debug(`Creating role: ${role.name}`);

  Role.create(role)
    .then((data) => {
      logger.info(`Role created successfully: ${data.id} - ${data.name}`);
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error creating role: ${err.message}`);
      res.status(500).send({
        message: err.message || "Some error occurred while creating the Role.",
      });
    });
};

// Retrieve all Roles from the database
exports.findAll = (req, res) => {
  logger.debug("Fetching all roles");

  Role.findAll({
    order: [["name", "ASC"]],
  })
    .then((data) => {
      logger.info(`Retrieved ${data.length} roles`);
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error retrieving roles: ${err.message}`);
      res.status(500).send({
        message: err.message || "Some error occurred while retrieving roles.",
      });
    });
};

// Find a single Role with an id
exports.findOne = (req, res) => {
  const id = req.params.id;
  logger.debug(`Finding role with id: ${id}`);

  Role.findByPk(id)
    .then((data) => {
      if (data) {
        logger.info(`Role found: ${id}`);
        res.send(data);
      } else {
        logger.warn(`Role not found with id: ${id}`);
        res.status(404).send({
          message: `Cannot find Role with id=${id}.`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error retrieving role ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error retrieving Role with id=" + id,
      });
    });
};

// Update a Role by the id in the request
exports.update = (req, res) => {
  const id = req.params.id;

  logger.debug(`Updating role ${id} with data: ${JSON.stringify(req.body)}`);

  Role.update(req.body, {
    where: { id: id },
  })
    .then((num) => {
      if (num == 1) {
        logger.info(`Role ${id} updated successfully`);
        res.send({
          message: "Role was updated successfully.",
        });
      } else {
        logger.warn(
          `Failed to update role ${id} - not found or empty body`
        );
        res.send({
          message: `Cannot update Role with id=${id}. Maybe Role was not found or req.body is empty!`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error updating role ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error updating Role with id=" + id,
      });
    });
};

// Delete a Role with the specified id in the request
exports.delete = (req, res) => {
  const id = req.params.id;

  logger.debug(`Attempting to delete role: ${id}`);

  Role.destroy({
    where: { id: id },
  })
    .then((num) => {
      if (num == 1) {
        logger.info(`Role ${id} deleted successfully`);
        res.send({
          message: "Role was deleted successfully!",
        });
      } else {
        logger.warn(`Cannot delete role ${id} - not found`);
        res.send({
          message: `Cannot delete Role with id=${id}. Maybe Role was not found!`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error deleting role ${id}: ${err.message}`);
      res.status(500).send({
        message: "Could not delete Role with id=" + id,
      });
    });
};

export default exports;

