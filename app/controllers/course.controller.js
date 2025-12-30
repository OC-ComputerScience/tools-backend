import db  from "../models/index.js";
import logger from "../config/logger.js";

const Course = db.course;
const Term = db.term;
const User = db.user;
const AssignedCourse = db.assignedCourse;
const Op = db.Sequelize.Op;
const exports = {};

// Create and Save a new Course
exports.create = (req, res) => {
  if (!req.body.courseNumber || !req.body.termId || !req.body.userId) {
    logger.warn('Course creation attempt with missing required fields');
    res.status(400).send({
      message: "Course number, term ID, and user ID are required!",
    });
    return;
  }

  const course = {
    termId: req.body.termId,
    courseNumber: req.body.courseNumber,
    courseSection: req.body.courseSection || "",
    courseDescription: req.body.courseDescription || "",
    userId: req.body.userId,
  };

  logger.debug(`Creating course: ${course.courseNumber} for term: ${course.termId}`);

  Course.create(course)
    .then((data) => {
      logger.info(`Course created successfully: ${data.id} - ${data.courseNumber}`);
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error creating course: ${err.message}`);
      res.status(500).send({
        message: err.message || "Some error occurred while creating the Course.",
      });
    });
};

// Retrieve all Courses from the database
exports.findAll = (req, res) => {
  const termId = req.query.termId;
  const userId = req.query.userId;
  
  let condition = {};
  if (termId) condition.termId = termId;
  if (userId) condition.userId = userId;

  logger.debug(`Fetching courses with condition: ${JSON.stringify(condition)}`);

  Course.findAll({ 
    where: condition,
    order: [['courseNumber', 'ASC'], ['courseSection', 'ASC']],
    include: [
      { model: Term, as: "term" },
      { model: User, as: "user" }
    ]
  })
    .then((data) => {
      logger.info(`Retrieved ${data.length} courses`);
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error retrieving courses: ${err.message}`);
      res.status(500).send({
        message: err.message || "Some error occurred while retrieving courses.",
      });
    });
};

// Find courses for a specific user (by email)
exports.findByUserEmail = (req, res) => {
  const email = req.params.email;
  const termId = req.query.termId;

  logger.debug(`Finding courses for user email: ${email}, termId: ${termId}`);

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

      Course.findAll({
        where: condition,
        order: [['courseNumber', 'ASC'], ['courseSection', 'ASC']],
        include: [
          { model: Term, as: "term" },
          { model: User, as: "user" },
          {
            model: AssignedCourse,
            as: "assignedCourse",
            required: false,
            include: [
              {
                model: Course,
                as: "assignedCourse",
                include: [
                  { model: Term, as: "term" }
                ]
              }
            ]
          }
        ]
      })
        .then((data) => {
          logger.info(`Retrieved ${data.length} courses for user ${email}`);
          res.send(data);
        })
        .catch((err) => {
          logger.error(`Error retrieving courses for user: ${err.message}`);
          res.status(500).send({
            message: err.message || "Some error occurred while retrieving courses.",
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

// Get courses with assignment count (for admin)
exports.findAllWithCount = (req, res) => {
  const termId = req.query.termId;
  const userId = req.query.userId;
  
  let condition = {};
  if (termId) condition.termId = parseInt(termId);
  // Only add userId filter if it's provided and not empty
  if (userId !== undefined && userId !== null && userId !== '' && userId !== 'null' && userId !== 'undefined') {
    condition.userId = parseInt(userId);
  }

  logger.debug(`Fetching courses with assignment count, condition: ${JSON.stringify(condition)}`);

  Course.findAll({
    where: condition,
    order: [['courseNumber', 'ASC'], ['courseSection', 'ASC']],
    attributes: ['id', 'courseNumber', 'courseSection', 'courseDescription', 'termId', 'userId'],
    subQuery: false,
    include: [
      { 
        model: Term, 
        as: "term",
        attributes: ['id', 'termName']
      },
      { 
        model: User, 
        as: "user",
        attributes: ['id', 'fName', 'lName', 'email']
      },
      {
        model: AssignedCourse,
        as: "assignedCourse",
        required: false,
        attributes: ['id', 'courseId', 'assignedCourseId'],
        include: [
          {
            model: Course,
            as: "assignedCourse",
            attributes: ['id', 'courseNumber', 'courseSection', 'courseDescription', 'termId', 'userId'],
            include: [
              { 
                model: Term, 
                as: "term",
                attributes: ['id', 'termName']
              }
            ]
          }
        ]
      }
    ]
  })
    .then((data) => {
      const coursesWithCount = data.map(course => {
        const courseData = course.toJSON();
        // Handle assigned course info - hasMany returns an array, so take the first one
        if (courseData.assignedCourse && Array.isArray(courseData.assignedCourse) && courseData.assignedCourse.length > 0) {
          const assigned = courseData.assignedCourse[0];
          logger.debug(`Course ${courseData.id} - assignedCourse[0]:`, JSON.stringify(assigned, null, 2));
          if (assigned && assigned.assignedCourse) {
            courseData.assignedCourseInfo = assigned.assignedCourse;
            logger.debug(`Course ${courseData.id} has assigned course: ${assigned.assignedCourse.courseNumber}-${assigned.assignedCourse.courseSection}`);
          } else {
            logger.debug(`Course ${courseData.id} has assignedCourse array but assigned.assignedCourse is missing. Assigned object keys:`, assigned ? Object.keys(assigned) : 'null');
            courseData.assignedCourseInfo = null;
          }
        } else {
          logger.debug(`Course ${courseData.id} has no assignedCourse or it's not an array`);
          courseData.assignedCourseInfo = null;
        }
        return courseData;
      });
      logger.info(`Retrieved ${coursesWithCount.length} courses with assignment info`);
      res.send(coursesWithCount);
    })
    .catch((err) => {
      logger.error(`Error retrieving courses with count: ${err.message}`);
      res.status(500).send({
        message: err.message || "Some error occurred while retrieving courses.",
      });
    });
};

// Find a single Course with an id
exports.findOne = (req, res) => {
  const id = req.params.id;
  logger.debug(`Finding course with id: ${id}`);

  Course.findByPk(id, {
    include: [
      { model: Term, as: "term" },
      { model: User, as: "user" }
    ]
  })
    .then((data) => {
      if (data) {
        logger.info(`Course found: ${id}`);
        res.send(data);
      } else {
        logger.warn(`Course not found with id: ${id}`);
        res.status(404).send({
          message: `Cannot find Course with id=${id}.`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error retrieving course ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error retrieving Course with id=" + id,
      });
    });
};

// Update a Course by the id in the request
exports.update = (req, res) => {
  const id = req.params.id;

  logger.debug(`Updating course ${id} with data: ${JSON.stringify(req.body)}`);

  Course.update(req.body, {
    where: { id: id },
  })
    .then((num) => {
      if (num == 1) {
        logger.info(`Course ${id} updated successfully`);
        res.send({
          message: "Course was updated successfully.",
        });
      } else {
        logger.warn(`Failed to update course ${id} - not found or empty body`);
        res.send({
          message: `Cannot update Course with id=${id}. Maybe Course was not found or req.body is empty!`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error updating course ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error updating Course with id=" + id,
      });
    });
};

// Delete a Course with the specified id in the request
exports.delete = (req, res) => {
  const id = req.params.id;

  logger.debug(`Attempting to delete course: ${id}`);

  Course.destroy({
    where: { id: id },
  })
    .then((num) => {
      if (num == 1) {
        logger.info(`Course ${id} deleted successfully`);
        res.send({
          message: "Course was deleted successfully!",
        });
      } else {
        logger.warn(`Cannot delete course ${id} - not found`);
        res.send({
          message: `Cannot delete Course with id=${id}. Maybe Course was not found!`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error deleting course ${id}: ${err.message}`);
      res.status(500).send({
        message: "Could not delete Course with id=" + id,
      });
    });
};

export default exports;

