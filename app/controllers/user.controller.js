import db  from "../models/index.js";
import logger from "../config/logger.js";

const User = db.user;
const Op = db.Sequelize.Op;
const exports = {};

// Retrieve all Users from the database
exports.findAll = (req, res) => {
  logger.debug('Fetching all users');

  User.findAll()
    .then((data) => {
      logger.info(`Retrieved ${data.length} users`);
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error retrieving users: ${err.message}`);
      res.status(500).send({
        message: err.message || "Some error occurred while retrieving users.",
      });
    });
};

// Find a single User with an id
exports.findOne = (req, res) => {
  const id = req.params.id;

  logger.debug(`Finding user with id: ${id}`);

  User.findByPk(id)
    .then((data) => {
      if (data) {
        logger.info(`User found: ${id}`);
        res.send(data);
      } else {
        logger.warn(`User not found with id: ${id}`);
        res.status(404).send({
          message: `Cannot find User with id=${id}.`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error retrieving user ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error retrieving User with id=" + id,
      });
    });
};

// Update a User by the id in the request
exports.update = (req, res) => {
  const id = req.params.id;

  logger.debug(`Updating user ${id} with data: ${JSON.stringify(req.body)}`);

  User.update(req.body, {
    where: { id: id },
  })
    .then((num) => {
      if (num == 1) {
        logger.info(`User ${id} updated successfully`);
        res.send({
          message: "User was updated successfully.",
        });
      } else {
        logger.warn(`Failed to update user ${id} - not found or empty body`);
        res.send({
          message: `Cannot update User with id=${id}. Maybe User was not found or req.body is empty!`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error updating user ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error updating User with id=" + id,
      });
    });
};

export default exports;

