
module.exports = (app) => {
  
    const transcriptCourseController = require('../controllers/transcriptCourse.controller');
    const { authenticate } = require("../authorization/authorization.js");
    var router = require("express").Router();

// Create a new TranscriptCourse
router.post('/', [authenticate], transcriptCourseController.create);

// Get all TranscriptCourses
router.get('/', [authenticate], transcriptCourseController.findAll);

// Get all TranscriptCourses
router.get('/transcript/:transcriptId', [authenticate], transcriptCourseController.getByTranscriptId);


// Get a single TranscriptCourse by id
router.get('/:id', [authenticate], transcriptCourseController.findOne);

// Update a TranscriptCourse
router.put('/:id', [authenticate], transcriptCourseController.update);

// Delete a TranscriptCourse
router.delete('/:id', [authenticate], transcriptCourseController.delete);

app.use("/transcript/transcriptCourses", router);

}