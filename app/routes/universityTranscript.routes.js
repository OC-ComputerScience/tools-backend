
module.exports = (app) => {
    const user = require("../controllers/user.controller.js");
    const universityTranscriptController = require('../controllers/universityTranscript.controller');
    const { authenticate } = require("../authorization/authorization.js");
    var router = require("express").Router();

// Create a new UniversityTranscript
router.post('/', [authenticate], universityTranscriptController.create);

// Get all UniversityTranscripts
router.get('/', [authenticate], universityTranscriptController.findAll);

// Get a single UniversityTranscript by id
router.get('/:id', [authenticate], universityTranscriptController.findOne);

// Update a UniversityTranscript
router.put('/:id', [authenticate], universityTranscriptController.update);

// Delete a UniversityTranscript
router.delete('/:id', [authenticate], universityTranscriptController.delete);

app.use("/transcript/universityTranscripts", router);
}