
module.exports = (app) => {
    const user = require("../controllers/user.controller.js");
    const universityCourseController = require('../controllers/universityCourse.controller');
    const { authenticate } = require("../authorization/authorization.js");
    var router = require("express").Router();

// Create a new UniversityCourse
router.post('/', [authenticate], universityCourseController.create);

// Get all UniversityCourses
router.get('/', [authenticate], universityCourseController.findAll);

// Get a single UniversityCourse by id
router.get('/university/:universityId', [authenticate], universityCourseController.findAllforUniversity);

// Update a UniversityCourse
router.put('/:id', [authenticate], universityCourseController.update);

// Delete a UniversityCourse
router.delete('/:id', [authenticate], universityCourseController.delete);

app.use("/transcript/universityCourses", router);
}