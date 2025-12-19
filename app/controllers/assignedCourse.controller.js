import db  from "../models/index.js";
import logger from "../config/logger.js";

const AssignedCourse = db.assignedCourse;
const Course = db.course;
const Term = db.term;
const Op = db.Sequelize.Op;
const exports = {};

// Create and Save a new AssignedCourse
exports.create = (req, res) => {
  if (!req.body.courseId || !req.body.assignedCourseId) {
    logger.warn('AssignedCourse creation attempt with missing required fields');
    res.status(400).send({
      message: "Course ID and Assigned Course ID are required!",
    });
    return;
  }

  const assignedCourse = {
    courseId: req.body.courseId,
    assignedCourseId: req.body.assignedCourseId,
  };

  logger.debug(`Creating assigned course: ${assignedCourse.courseId} -> ${assignedCourse.assignedCourseId}`);

  AssignedCourse.create(assignedCourse)
    .then((data) => {
      logger.info(`AssignedCourse created successfully: ${data.id}`);
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error creating assigned course: ${err.message}`);
      res.status(500).send({
        message: err.message || "Some error occurred while creating the AssignedCourse.",
      });
    });
};

// Retrieve all AssignedCourses from the database
exports.findAll = (req, res) => {
  const courseId = req.query.courseId;

  let condition = courseId ? { courseId: courseId } : {};

  logger.debug(`Fetching assigned courses with condition: ${JSON.stringify(condition)}`);

  // When no courseId filter, use a simple query without includes to avoid alias conflicts
  if (!courseId) {
    // Simple query for counting all assigned courses
    AssignedCourse.findAll({
      where: condition,
      attributes: ['id', 'courseId', 'assignedCourseId'],
      raw: false
    })
      .then((data) => {
        logger.info(`Retrieved ${data.length} assigned courses across all terms`);
        res.send(data);
      })
      .catch((err) => {
        logger.error(`Error retrieving assigned courses: ${err.message}`);
        res.status(500).send({
          message: err.message || "Some error occurred while retrieving assigned courses.",
        });
      });
  } else {
    // When courseId is provided, include Course relationships for details
    AssignedCourse.findAll({
      where: condition,
      include: [
        { 
          model: Course, 
          as: "course",
          attributes: ['id', 'courseNumber', 'courseSection', 'courseDescription', 'termId', 'userId']
        },
        { 
          model: Course, 
          as: "assignedCourse",
          attributes: ['id', 'courseNumber', 'courseSection', 'courseDescription', 'termId', 'userId']
        }
      ],
      distinct: true
    })
      .then((data) => {
        logger.info(`Retrieved ${data.length} assigned courses for courseId: ${courseId}`);
        res.send(data);
      })
      .catch((err) => {
        logger.error(`Error retrieving assigned courses: ${err.message}`);
        res.status(500).send({
          message: err.message || "Some error occurred while retrieving assigned courses.",
        });
      });
  }
};

// Find a single AssignedCourse with an id
exports.findOne = (req, res) => {
  const id = req.params.id;
  logger.debug(`Finding assigned course with id: ${id}`);

  AssignedCourse.findByPk(id, {
    include: [
      { model: Course, as: "course" },
      { model: Course, as: "assignedCourse" }
    ]
  })
    .then((data) => {
      if (data) {
        logger.info(`AssignedCourse found: ${id}`);
        res.send(data);
      } else {
        logger.warn(`AssignedCourse not found with id: ${id}`);
        res.status(404).send({
          message: `Cannot find AssignedCourse with id=${id}.`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error retrieving assigned course ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error retrieving AssignedCourse with id=" + id,
      });
    });
};

// Find assigned course for a specific course
exports.findByCourseId = (req, res) => {
  const courseId = req.params.courseId;
  logger.debug(`Finding assigned course for courseId: ${courseId}`);

  AssignedCourse.findOne({
    where: { courseId: courseId },
    include: [
      { 
        model: Course, 
        as: "course",
        include: [{ model: Term, as: "term" }]
      },
      { 
        model: Course, 
        as: "assignedCourse",
        include: [{ model: Term, as: "term" }]
      }
    ]
  })
    .then((data) => {
      if (data) {
        logger.info(`AssignedCourse found for course: ${courseId}`);
        res.send(data);
      } else {
        logger.debug(`No assigned course found for course: ${courseId}`);
        res.send(null);
      }
    })
    .catch((err) => {
      logger.error(`Error retrieving assigned course for course ${courseId}: ${err.message}`);
      res.status(500).send({
        message: "Error retrieving AssignedCourse for course=" + courseId,
      });
    });
};

// Update a AssignedCourse by the id in the request
exports.update = (req, res) => {
  const id = req.params.id;

  logger.debug(`Updating assigned course ${id} with data: ${JSON.stringify(req.body)}`);

  AssignedCourse.update(req.body, {
    where: { id: id },
  })
    .then((num) => {
      if (num == 1) {
        logger.info(`AssignedCourse ${id} updated successfully`);
        res.send({
          message: "AssignedCourse was updated successfully.",
        });
      } else {
        logger.warn(`Failed to update assigned course ${id} - not found or empty body`);
        res.send({
          message: `Cannot update AssignedCourse with id=${id}. Maybe AssignedCourse was not found or req.body is empty!`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error updating assigned course ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error updating AssignedCourse with id=" + id,
      });
    });
};

// Delete a AssignedCourse with the specified id in the request
exports.delete = (req, res) => {
  const id = req.params.id;

  logger.debug(`Attempting to delete assigned course: ${id}`);

  AssignedCourse.destroy({
    where: { id: id },
  })
    .then((num) => {
      if (num == 1) {
        logger.info(`AssignedCourse ${id} deleted successfully`);
        res.send({
          message: "AssignedCourse was deleted successfully!",
        });
      } else {
        logger.warn(`Cannot delete assigned course ${id} - not found`);
        res.send({
          message: `Cannot delete AssignedCourse with id=${id}. Maybe AssignedCourse was not found!`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error deleting assigned course ${id}: ${err.message}`);
      res.status(500).send({
        message: "Could not delete AssignedCourse with id=" + id,
      });
    });
};

// Delete assigned course by courseId
exports.deleteByCourseId = (req, res) => {
  const courseId = req.params.courseId;

  logger.debug(`Attempting to delete assigned course for courseId: ${courseId}`);

  AssignedCourse.destroy({
    where: { courseId: courseId },
  })
    .then((num) => {
      if (num >= 1) {
        logger.info(`AssignedCourse(s) deleted successfully for course: ${courseId}`);
        res.send({
          message: "AssignedCourse was deleted successfully!",
        });
      } else {
        logger.warn(`Cannot delete assigned course for courseId ${courseId} - not found`);
        res.send({
          message: `Cannot delete AssignedCourse for courseId=${courseId}. Maybe AssignedCourse was not found!`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error deleting assigned course for courseId ${courseId}: ${err.message}`);
      res.status(500).send({
        message: "Could not delete AssignedCourse for courseId=" + courseId,
      });
    });
};

export default exports;

