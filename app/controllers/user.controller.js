import db  from "../models/index.js";
import logger from "../config/logger.js";

const User = db.user;
const Role = db.role;
const UserRole = db.userRole;
const Op = db.Sequelize.Op;
const exports = {};

// Retrieve all Users from the database
exports.findAll = (req, res) => {
  logger.debug('Fetching all users');

  User.findAll({
    include: [
      {
        model: Role,
        as: "roles",
        attributes: ["id", "name", "description"],
        through: { attributes: [] }, // Exclude join table attributes
      },
    ],
  })
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

  User.findByPk(id, {
    include: [
      {
        model: Role,
        as: "roles",
        attributes: ["id", "name", "description"],
        through: { attributes: [] }, // Exclude join table attributes
      },
    ],
  })
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
exports.update = async (req, res) => {
  const id = req.params.id;

  logger.debug(`Updating user ${id} with data: ${JSON.stringify(req.body)}`);

  try {
    // Extract roleIds and roles from request body if present (roles is the populated array, we only want roleIds)
    const { roleIds, roles, ...userData } = req.body;

    // Update user fields (excluding roleIds)
    const [num] = await User.update(userData, {
      where: { id: id },
    });

    if (num !== 1) {
      logger.warn(`Failed to update user ${id} - not found or empty body`);
      return res.send({
        message: `Cannot update User with id=${id}. Maybe User was not found or req.body is empty!`,
      });
    }

    // If roleIds are provided, update the user's roles
    if (roleIds !== undefined && Array.isArray(roleIds)) {
      const user = await User.findByPk(id);
      if (!user) {
        return res.status(404).send({
          message: `Cannot find User with id=${id}.`,
        });
      }

      // Set roles using the roleIds array
      // Sequelize will automatically handle adding/removing associations
      const roles = await Role.findAll({
        where: { id: { [Op.in]: roleIds } },
      });
      await user.setRoles(roles);

      logger.info(`User ${id} roles updated: ${roleIds.join(", ")}`);
    }

    // Fetch updated user with roles
    const updatedUser = await User.findByPk(id, {
      include: [
        {
          model: Role,
          as: "roles",
          attributes: ["id", "name", "description"],
          through: { attributes: [] },
        },
      ],
    });

    logger.info(`User ${id} updated successfully`);
    res.send(updatedUser);
  } catch (err) {
    logger.error(`Error updating user ${id}: ${err.message}`);
    res.status(500).send({
      message: "Error updating User with id=" + id,
    });
  }
};

export default exports;

