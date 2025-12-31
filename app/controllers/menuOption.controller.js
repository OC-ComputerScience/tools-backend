import db from "../models/index.js";
import logger from "../config/logger.js";

const MenuOption = db.menuOption;
const Role = db.role;
const Op = db.Sequelize.Op;
const exports = {};

// Create and Save a new MenuOption
exports.create = (req, res) => {
  if (!req.body.option || !req.body.routeName) {
    logger.warn("MenuOption creation attempt with missing required fields");
    res.status(400).send({
      message: "Option and routeName are required!",
    });
    return;
  }

  const menuOption = {
    option: req.body.option,
    routeName: req.body.routeName,
  };

  logger.debug(`Creating menuOption: ${menuOption.option}`);

  MenuOption.create(menuOption)
    .then((data) => {
      logger.info(`MenuOption created successfully: ${data.id} - ${data.option}`);
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error creating menuOption: ${err.message}`);
      res.status(500).send({
        message: err.message || "Some error occurred while creating the MenuOption.",
      });
    });
};

// Retrieve all MenuOptions from the database
exports.findAll = (req, res) => {
  logger.debug("Fetching all menuOptions");

  MenuOption.findAll({
    include: [
      {
        model: Role,
        as: "roles",
        attributes: ["id", "name", "description"],
        through: { attributes: [] }, // Exclude join table attributes
      },
    ],
    order: [["option", "ASC"]],
  })
    .then((data) => {
      logger.info(`Retrieved ${data.length} menuOptions`);
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error retrieving menuOptions: ${err.message}`);
      res.status(500).send({
        message: err.message || "Some error occurred while retrieving menuOptions.",
      });
    });
};

// Find a single MenuOption with an id
exports.findOne = (req, res) => {
  const id = req.params.id;
  logger.debug(`Finding menuOption with id: ${id}`);

  MenuOption.findByPk(id, {
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
        logger.info(`MenuOption found: ${id}`);
        res.send(data);
      } else {
        logger.warn(`MenuOption not found with id: ${id}`);
        res.status(404).send({
          message: `Cannot find MenuOption with id=${id}.`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error retrieving menuOption ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error retrieving MenuOption with id=" + id,
      });
    });
};

// Update a MenuOption by the id in the request
exports.update = async (req, res) => {
  const id = req.params.id;

  logger.debug(`Updating menuOption ${id} with data: ${JSON.stringify(req.body)}`);

  try {
    // Extract roleIds from request body if present
    const { roleIds, roles, ...menuOptionData } = req.body;

    // Update menuOption fields (excluding roleIds and roles)
    const [num] = await MenuOption.update(menuOptionData, {
      where: { id: id },
    });

    if (num !== 1) {
      logger.warn(`Failed to update menuOption ${id} - not found or empty body`);
      return res.send({
        message: `Cannot update MenuOption with id=${id}. Maybe MenuOption was not found or req.body is empty!`,
      });
    }

    // If roleIds are provided, update the menuOption's roles
    if (roleIds !== undefined && Array.isArray(roleIds)) {
      const menuOption = await MenuOption.findByPk(id);
      if (!menuOption) {
        return res.status(404).send({
          message: `Cannot find MenuOption with id=${id}.`,
        });
      }

      // Set roles using the roleIds array
      const roles = await Role.findAll({
        where: { id: { [Op.in]: roleIds } },
      });
      await menuOption.setRoles(roles);

      logger.info(`MenuOption ${id} roles updated: ${roleIds.join(", ")}`);
    }

    // Fetch updated menuOption with roles
    const updatedMenuOption = await MenuOption.findByPk(id, {
      include: [
        {
          model: Role,
          as: "roles",
          attributes: ["id", "name", "description"],
          through: { attributes: [] },
        },
      ],
    });

    logger.info(`MenuOption ${id} updated successfully`);
    res.send(updatedMenuOption);
  } catch (err) {
    logger.error(`Error updating menuOption ${id}: ${err.message}`);
    res.status(500).send({
      message: "Error updating MenuOption with id=" + id,
    });
  }
};

// Delete a MenuOption with the specified id in the request
exports.delete = (req, res) => {
  const id = req.params.id;

  logger.debug(`Attempting to delete menuOption: ${id}`);

  MenuOption.destroy({
    where: { id: id },
  })
    .then((num) => {
      if (num == 1) {
        logger.info(`MenuOption ${id} deleted successfully`);
        res.send({
          message: "MenuOption was deleted successfully!",
        });
      } else {
        logger.warn(`Cannot delete menuOption ${id} - not found`);
        res.send({
          message: `Cannot delete MenuOption with id=${id}. Maybe MenuOption was not found!`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error deleting menuOption ${id}: ${err.message}`);
      res.status(500).send({
        message: "Could not delete MenuOption with id=" + id,
      });
    });
};

export default exports;

