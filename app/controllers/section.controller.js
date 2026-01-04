import db from "../models/index.js";
import logger from "../config/logger.js";

const Section = db.section;
const AssignedCourse = db.assignedCourse;
const User = db.user;
const Semester = db.Semester;
const Op = db.Sequelize.Op;
const exports = {};

// Create and Save a new Section
exports.create = (req, res) => {
  if (!req.body.semesterId || !req.body.courseNumber || !req.body.courseSection || !req.body.userId) {
    logger.warn("Section creation attempt with missing required fields");
    res.status(400).send({
      message: "Semester ID, course number, course section, and user ID are required!",
    });
    return;
  }

  const section = {
    semesterId: req.body.semesterId,
    courseNumber: req.body.courseNumber,
    courseSection: req.body.courseSection,
    courseDescription: req.body.courseDescription || null,
    userId: req.body.userId,
  };

  logger.debug(`Creating section: ${section.courseNumber}-${section.courseSection}`);

  Section.create(section)
    .then((data) => {
      logger.info(`Section created successfully: ${data.id}`);
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error creating section: ${err.message}`);
      res.status(500).send({
        message: err.message || "Some error occurred while creating the Section.",
      });
    });
};

// Retrieve all Sections from the database
exports.findAll = (req, res) => {
  const semesterId = req.query.semesterId;
  const userId = req.query.userId;

  let condition = {};
  if (semesterId) {
    condition.semesterId = semesterId;
  }
  if (userId) {
    condition.userId = userId;
  }

  logger.debug(`Fetching sections with condition: ${JSON.stringify(condition)}`);

  Section.findAll({
    where: condition,
    include: [
      { model: User, as: "user", attributes: ["id", "fName", "lName", "email"] },
      { model: Semester, as: "semester", attributes: ["id", "name", "startDate", "endDate"] },
    ],
    order: [["courseNumber", "ASC"], ["courseSection", "ASC"]],
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

// Retrieve all Sections with assignment count information
exports.findAllWithCount = (req, res) => {
  const semesterId = req.query.semesterId;
  const userId = req.query.userId;

  let condition = {};
  if (semesterId) {
    condition.semesterId = semesterId;
  }
  if (userId) {
    condition.userId = userId;
  }

  logger.debug(`Fetching sections with count, condition: ${JSON.stringify(condition)}`);

  Section.findAll({
    where: condition,
    include: [
      { model: User, as: "user", attributes: ["id", "fName", "lName", "email"] },
      { model: Semester, as: "semester", attributes: ["id", "name", "startDate", "endDate"] },
    ],
    order: [["courseNumber", "ASC"], ["courseSection", "ASC"]],
  })
    .then(async (data) => {
      // Fetch assigned courses with includes - now that model fields match database
      const sectionIds = data.map(s => s.id);
      const assignedCourses = await AssignedCourse.findAll({
        where: {
          sectionId: { [Op.in]: sectionIds }
        },
        include: [
          {
            model: Section,
            as: "assignedSection",
            attributes: ["id", "courseNumber", "courseSection", "courseDescription"],
          },
        ],
      });

      // Group assigned courses by sectionId
      const assignedBySectionId = {};
      assignedCourses.forEach(ac => {
        if (!assignedBySectionId[ac.sectionId]) {
          assignedBySectionId[ac.sectionId] = [];
        }
        assignedBySectionId[ac.sectionId].push(ac.toJSON());
      });

      // Transform the data to include assignment info in a more frontend-friendly format
      const transformedData = data.map((section) => {
        const sectionJson = section.toJSON();
        const assignedSections = assignedBySectionId[section.id] || [];
        // Get the first assigned section if any exist
        const assignedSectionInfo =
          assignedSections.length > 0 && assignedSections[0].assignedSection
            ? assignedSections[0].assignedSection
            : null;
        
        return {
          ...sectionJson,
          assignedSectionInfo: assignedSectionInfo,
          assignedCourse: assignedSections, // Keep array for compatibility
        };
      });

      logger.info(`Retrieved ${transformedData.length} sections with count`);
      res.send(transformedData);
    })
    .catch((err) => {
      logger.error(`Error retrieving sections with count: ${err.message}`);
      res.status(500).send({
        message: err.message || "Some error occurred while retrieving sections with count.",
      });
    });
};

// Find sections by user email
exports.findByUserEmail = (req, res) => {
  const email = req.params.email;
  const semesterId = req.query.semesterId;

  logger.debug(`Finding sections for user email: ${email}, semesterId: ${semesterId}`);

  // First find the user by email
  User.findOne({
    where: { email: email },
  })
    .then((user) => {
      if (!user) {
        logger.warn(`User not found with email: ${email}`);
        res.send([]);
        return;
      }

      let condition = { userId: user.id };
      if (semesterId) {
        condition.semesterId = semesterId;
      }

      return Section.findAll({
        where: condition,
        include: [
          { model: User, as: "user", attributes: ["id", "fName", "lName", "email"] },
          { model: Semester, as: "semester", attributes: ["id", "name", "startDate", "endDate"] },
        ],
        order: [["courseNumber", "ASC"], ["courseSection", "ASC"]],
      });
    })
    .then(async (data) => {
      if (!data) return; // Already sent response in user lookup
      
      // Fetch assigned courses with includes - now that model fields match database
      const sectionIds = data.map(s => s.id);
      const assignedCourses = await AssignedCourse.findAll({
        where: {
          sectionId: { [Op.in]: sectionIds }
        },
        include: [
          {
            model: Section,
            as: "assignedSection",
            attributes: ["id", "courseNumber", "courseSection", "courseDescription"],
            include: [
              { model: Semester, as: "semester", attributes: ["id", "name", "startDate", "endDate"] },
            ],
          },
        ],
      });

      // Group assigned courses by sectionId
      const assignedBySectionId = {};
      assignedCourses.forEach(ac => {
        if (!assignedBySectionId[ac.sectionId]) {
          assignedBySectionId[ac.sectionId] = [];
        }
        assignedBySectionId[ac.sectionId].push(ac.toJSON());
      });

      // Transform data to match frontend expectations
      const transformedData = data.map((section) => {
        const sectionJson = section.toJSON();
        // Get the first assigned course record if any exist
        const assignedSections = assignedBySectionId[section.id] || [];
        // Frontend expects assignedCourse to be the full AssignedCourse object with nested assignedSection
        const assignedCourse =
          assignedSections.length > 0
            ? assignedSections[0] // Return the full AssignedCourse object which includes assignedSection
            : null;

        return {
          ...sectionJson,
          assignedCourse: assignedCourse, // Full AssignedCourse object with nested assignedSection
        };
      });

      logger.info(`Retrieved ${transformedData.length} sections for user email: ${email}`);
      res.send(transformedData);
    })
    .catch((err) => {
      logger.error(`Error retrieving sections for user email ${email}: ${err.message}`);
      res.status(500).send({
        message: err.message || "Some error occurred while retrieving sections for user.",
      });
    });
};

// Find a single Section with an id
exports.findOne = (req, res) => {
  const id = req.params.id;
  logger.debug(`Finding section with id: ${id}`);

  Section.findByPk(id, {
    include: [
      { model: User, as: "user", attributes: ["id", "fName", "lName", "email"] },
      { model: Semester, as: "semester", attributes: ["id", "name", "startDate", "endDate"] },
    ],
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

  logger.debug(`Updating section ${id} with data: ${JSON.stringify(req.body)}`);

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
        logger.warn(`Failed to update section ${id} - not found or empty body`);
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
