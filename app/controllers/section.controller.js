import db from "../models/index.js";
import logger from "../config/logger.js";

const Section = db.section;
const Term = db.term;
const User = db.user;
const AssignedCourse = db.assignedCourse;
const Op = db.Sequelize.Op;
const exports = {};

// Create and Save a new Section
exports.create = (req, res) => {
  if (!req.body.courseNumber || !req.body.termId || !req.body.userId) {
    logger.warn("Section creation attempt with missing required fields");
    res.status(400).send({
      message: "Course number, term ID, and user ID are required!",
    });
    return;
  }

  const section = {
    termId: req.body.termId,
    courseNumber: req.body.courseNumber,
    courseSection: req.body.courseSection || "",
    courseDescription: req.body.courseDescription || "",
    userId: req.body.userId,
  };

  logger.debug(
    `Creating section: ${section.courseNumber} for term: ${section.termId}`
  );

  Section.create(section)
    .then((data) => {
      logger.info(
        `Section created successfully: ${data.id} - ${data.courseNumber}`
      );
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error creating section: ${err.message}`);
      res.status(500).send({
        message:
          err.message || "Some error occurred while creating the Section.",
      });
    });
};

// Retrieve all Sections from the database
exports.findAll = (req, res) => {
  const termId = req.query.termId;
  const userId = req.query.userId;

  let condition = {};
  if (termId) condition.termId = termId;
  if (userId) condition.userId = userId;

  logger.debug(`Fetching sections with condition: ${JSON.stringify(condition)}`);

  Section.findAll({
    where: condition,
    order: [
      ["courseNumber", "ASC"],
      ["courseSection", "ASC"],
    ],
    include: [{ model: Term, as: "term" }, { model: User, as: "user" }],
  })
    .then((data) => {
      logger.info(`Retrieved ${data.length} sections`);
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error retrieving sections: ${err.message}`);
      res.status(500).send({
        message: err.message || "Some error occurred while retrieving sections.",
      });
    });
};

// Find sections for a specific user (by email)
exports.findByUserEmail = (req, res) => {
  const email = req.params.email;
  const termId = req.query.termId;

  logger.debug(`Finding sections for user email: ${email}, termId: ${termId}`);

  User.findOne({ where: { email: email } })
    .then((user) => {
      if (!user) {
        logger.warn(`User not found with email: ${email}`);
        res.status(404).send({
          message: `User with email ${email} not found.`,
        });
        return;
      }

      let condition = { userId: user.id };
      if (termId) condition.termId = termId;

      Section.findAll({
        where: condition,
        order: [
          ["courseNumber", "ASC"],
          ["courseSection", "ASC"],
        ],
        include: [
          { model: Term, as: "term" },
          { model: User, as: "user" },
          {
            model: AssignedCourse,
            as: "assignedCourse",
            required: false,
            include: [
              {
                model: Section,
                as: "assignedSection",
                include: [{ model: Term, as: "term" }],
              },
            ],
          },
        ],
      })
        .then((data) => {
          logger.info(`Retrieved ${data.length} sections for user ${email}`);
          res.send(data);
        })
        .catch((err) => {
          logger.error(`Error retrieving sections for user: ${err.message}`);
          res.status(500).send({
            message:
              err.message ||
              "Some error occurred while retrieving sections.",
          });
        });
    })
    .catch((err) => {
      logger.error(`Error finding user: ${err.message}`);
      res.status(500).send({
        message: "Error finding user.",
      });
    });
};

// Get sections with assignment count (for admin)
exports.findAllWithCount = (req, res) => {
  const termId = req.query.termId;
  const userId = req.query.userId;

  let condition = {};
  if (termId) condition.termId = parseInt(termId);
  // Only add userId filter if it's provided and not empty
  if (
    userId !== undefined &&
    userId !== null &&
    userId !== "" &&
    userId !== "null" &&
    userId !== "undefined"
  ) {
    condition.userId = parseInt(userId);
  }

  logger.debug(
    `Fetching sections with assignment count, condition: ${JSON.stringify(
      condition
    )}`
  );

  Section.findAll({
    where: condition,
    order: [
      ["courseNumber", "ASC"],
      ["courseSection", "ASC"],
    ],
    attributes: [
      "id",
      "courseNumber",
      "courseSection",
      "courseDescription",
      "termId",
      "userId",
    ],
    subQuery: false,
    include: [
      {
        model: Term,
        as: "term",
        attributes: ["id", "termName"],
      },
      {
        model: User,
        as: "user",
        attributes: ["id", "fName", "lName", "email"],
      },
      {
        model: AssignedCourse,
        as: "assignedCourse",
        required: false,
        attributes: ["id", "sectionId", "assignedSectionId"],
        include: [
          {
            model: Section,
            as: "assignedSection",
            attributes: [
              "id",
              "courseNumber",
              "courseSection",
              "courseDescription",
              "termId",
              "userId",
            ],
            include: [
              {
                model: Term,
                as: "term",
                attributes: ["id", "termName"],
              },
            ],
          },
        ],
      },
    ],
  })
    .then((data) => {
      const sectionsWithCount = data.map((section) => {
        const sectionData = section.toJSON();
        // Handle assigned section info - hasMany returns an array, so take the first one
        if (
          sectionData.assignedCourse &&
          Array.isArray(sectionData.assignedCourse) &&
          sectionData.assignedCourse.length > 0
        ) {
          const assigned = sectionData.assignedCourse[0];
          logger.debug(
            `Section ${sectionData.id} - assignedCourse[0]:`,
            JSON.stringify(assigned, null, 2)
          );
          if (assigned && assigned.assignedSection) {
            sectionData.assignedSectionInfo = assigned.assignedSection;
            logger.debug(
              `Section ${sectionData.id} has assigned section: ${assigned.assignedSection.courseNumber}-${assigned.assignedSection.courseSection}`
            );
          } else {
            logger.debug(
              `Section ${sectionData.id} has assignedCourse array but assigned.assignedSection is missing. Assigned object keys:`,
              assigned ? Object.keys(assigned) : "null"
            );
            sectionData.assignedSectionInfo = null;
          }
        } else {
          logger.debug(
            `Section ${sectionData.id} has no assignedCourse or it's not an array`
          );
          sectionData.assignedSectionInfo = null;
        }
        return sectionData;
      });
      logger.info(`Retrieved ${sectionsWithCount.length} sections with assignment info`);
      res.send(sectionsWithCount);
    })
    .catch((err) => {
      logger.error(`Error retrieving sections with count: ${err.message}`);
      res.status(500).send({
        message:
          err.message || "Some error occurred while retrieving sections.",
      });
    });
};

// Find a single Section with an id
exports.findOne = (req, res) => {
  const id = req.params.id;
  logger.debug(`Finding section with id: ${id}`);

  Section.findByPk(id, {
    include: [{ model: Term, as: "term" }, { model: User, as: "user" }],
  })
    .then((data) => {
      if (data) {
        logger.info(`Section found: ${id}`);
        res.send(data);
      } else {
        logger.warn(`Section not found with id: ${id}`);
        res.status(404).send({
          message: `Cannot find Section with id=${id}.`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error retrieving section ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error retrieving Section with id=" + id,
      });
    });
};

// Update a Section by the id in the request
exports.update = (req, res) => {
  const id = req.params.id;

  logger.debug(
    `Updating section ${id} with data: ${JSON.stringify(req.body)}`
  );

  Section.update(req.body, {
    where: { id: id },
  })
    .then((num) => {
      if (num == 1) {
        logger.info(`Section ${id} updated successfully`);
        res.send({
          message: "Section was updated successfully.",
        });
      } else {
        logger.warn(
          `Failed to update section ${id} - not found or empty body`
        );
        res.send({
          message: `Cannot update Section with id=${id}. Maybe Section was not found or req.body is empty!`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error updating section ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error updating Section with id=" + id,
      });
    });
};

// Delete a Section with the specified id in the request
exports.delete = (req, res) => {
  const id = req.params.id;

  logger.debug(`Attempting to delete section: ${id}`);

  Section.destroy({
    where: { id: id },
  })
    .then((num) => {
      if (num == 1) {
        logger.info(`Section ${id} deleted successfully`);
        res.send({
          message: "Section was deleted successfully!",
        });
      } else {
        logger.warn(`Cannot delete section ${id} - not found`);
        res.send({
          message: `Cannot delete Section with id=${id}. Maybe Section was not found!`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error deleting section ${id}: ${err.message}`);
      res.status(500).send({
        message: "Could not delete Section with id=" + id,
      });
    });
};

export default exports;

