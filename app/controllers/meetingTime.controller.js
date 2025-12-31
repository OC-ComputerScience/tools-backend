import db from "../models/index.js";
import logger from "../config/logger.js";

const MeetingTime = db.meetingTime;
const Section = db.section;
const Op = db.Sequelize.Op;
const exports = {};

// Create and Save a new MeetingTime
exports.create = (req, res) => {
  if (!req.body.sectionId || !req.body.startTime || !req.body.endTime) {
    logger.warn("MeetingTime creation attempt with missing required fields");
    res.status(400).send({
      message: "Section ID, start time, and end time are required!",
    });
    return;
  }

  const meetingTime = {
    sectionId: req.body.sectionId,
    monday: req.body.monday || false,
    tuesday: req.body.tuesday || false,
    wednesday: req.body.wednesday || false,
    thursday: req.body.thursday || false,
    friday: req.body.friday || false,
    saturday: req.body.saturday || false,
    sunday: req.body.sunday || false,
    startTime: req.body.startTime,
    endTime: req.body.endTime,
  };

  logger.debug(`Creating meeting time for section: ${meetingTime.sectionId}`);

  MeetingTime.create(meetingTime)
    .then((data) => {
      logger.info(`MeetingTime created successfully: ${data.id}`);
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error creating meeting time: ${err.message}`);
      res.status(500).send({
        message:
          err.message ||
          "Some error occurred while creating the MeetingTime.",
      });
    });
};

// Retrieve all MeetingTimes from the database
exports.findAll = (req, res) => {
  const sectionId = req.query.sectionId;

  let condition = sectionId ? { sectionId: sectionId } : {};

  logger.debug(
    `Fetching meeting times with condition: ${JSON.stringify(condition)}`
  );

  MeetingTime.findAll({
    where: condition,
    include: [{ model: Section, as: "section" }],
    order: [["startTime", "ASC"]],
  })
    .then((data) => {
      logger.info(`Retrieved ${data.length} meeting times`);
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error retrieving meeting times: ${err.message}`);
      res.status(500).send({
        message:
          err.message ||
          "Some error occurred while retrieving meeting times.",
      });
    });
};

// Find a single MeetingTime with an id
exports.findOne = (req, res) => {
  const id = req.params.id;
  logger.debug(`Finding meeting time with id: ${id}`);

  MeetingTime.findByPk(id, {
    include: [{ model: Section, as: "section" }],
  })
    .then((data) => {
      if (data) {
        logger.info(`MeetingTime found: ${id}`);
        res.send(data);
      } else {
        logger.warn(`MeetingTime not found with id: ${id}`);
        res.status(404).send({
          message: `Cannot find MeetingTime with id=${id}.`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error retrieving meeting time ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error retrieving MeetingTime with id=" + id,
      });
    });
};

// Find all meeting times for a specific section
exports.findBySectionId = (req, res) => {
  const sectionId = req.params.sectionId;
  logger.debug(`Finding meeting times for sectionId: ${sectionId}`);

  MeetingTime.findAll({
    where: { sectionId: sectionId },
    include: [{ model: Section, as: "section" }],
    order: [["startTime", "ASC"]],
  })
    .then((data) => {
      logger.info(`Retrieved ${data.length} meeting times for section: ${sectionId}`);
      res.send(data);
    })
    .catch((err) => {
      logger.error(
        `Error retrieving meeting times for section ${sectionId}: ${err.message}`
      );
      res.status(500).send({
        message: "Error retrieving MeetingTimes for section=" + sectionId,
      });
    });
};

// Update a MeetingTime by the id in the request
exports.update = (req, res) => {
  const id = req.params.id;

  logger.debug(
    `Updating meeting time ${id} with data: ${JSON.stringify(req.body)}`
  );

  MeetingTime.update(req.body, {
    where: { id: id },
  })
    .then((num) => {
      if (num == 1) {
        logger.info(`MeetingTime ${id} updated successfully`);
        res.send({
          message: "MeetingTime was updated successfully.",
        });
      } else {
        logger.warn(
          `Failed to update meeting time ${id} - not found or empty body`
        );
        res.send({
          message: `Cannot update MeetingTime with id=${id}. Maybe MeetingTime was not found or req.body is empty!`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error updating meeting time ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error updating MeetingTime with id=" + id,
      });
    });
};

// Delete a MeetingTime with the specified id in the request
exports.delete = (req, res) => {
  const id = req.params.id;

  logger.debug(`Attempting to delete meeting time: ${id}`);

  MeetingTime.destroy({
    where: { id: id },
  })
    .then((num) => {
      if (num == 1) {
        logger.info(`MeetingTime ${id} deleted successfully`);
        res.send({
          message: "MeetingTime was deleted successfully!",
        });
      } else {
        logger.warn(`Cannot delete meeting time ${id} - not found`);
        res.send({
          message: `Cannot delete MeetingTime with id=${id}. Maybe MeetingTime was not found!`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error deleting meeting time ${id}: ${err.message}`);
      res.status(500).send({
        message: "Could not delete MeetingTime with id=" + id,
      });
    });
};

// Delete all meeting times for a specific section
exports.deleteBySectionId = (req, res) => {
  const sectionId = req.params.sectionId;

  logger.debug(`Attempting to delete meeting times for sectionId: ${sectionId}`);

  MeetingTime.destroy({
    where: { sectionId: sectionId },
  })
    .then((num) => {
      if (num >= 1) {
        logger.info(
          `MeetingTime(s) deleted successfully for section: ${sectionId}`
        );
        res.send({
          message: "MeetingTime(s) were deleted successfully!",
        });
      } else {
        logger.warn(
          `Cannot delete meeting times for sectionId ${sectionId} - not found`
        );
        res.send({
          message: `Cannot delete MeetingTimes for sectionId=${sectionId}. Maybe MeetingTimes were not found!`,
        });
      }
    })
    .catch((err) => {
      logger.error(
        `Error deleting meeting times for sectionId ${sectionId}: ${err.message}`
      );
      res.status(500).send({
        message: "Could not delete MeetingTimes for sectionId=" + sectionId,
      });
    });
};

export default exports;

