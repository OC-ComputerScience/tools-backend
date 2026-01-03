

module.exports = (app) => {
    const user = require("../controllers/user.controller.js");
    const ocCourseController = require('../controllers/ocCourse.controller');
    const { authenticate } = require("../authorization/authorization.js");
    var router = require("express").Router();

// Create a new OCCourse
router.post('/', [authenticate], ocCourseController.create);

// Get all OCCourses
router.get('/', [authenticate], ocCourseController.findAll);

// Get a single OCCourse by id
router.get('/:id', [authenticate], ocCourseController.findOne);

// Update an OCCourse
router.put('/:id', [authenticate], ocCourseController.update);

// Delete an OCCourse
router.delete('/:id', [authenticate], ocCourseController.delete);

app.use("/transcript/OCCourses", router);
}