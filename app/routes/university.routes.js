module.exports = (app) => {
  
    const universityController = require('../controllers/university.controller');
    const { authenticate } = require("../authorization/authorization.js");
    var router = require("express").Router();

// Create a new University
router.post('/', [authenticate], universityController.create);

// Get all Universities
router.get('/', [authenticate], universityController.findAll);

// Get a single University by id
router.get('/:id', [authenticate], universityController.findOne);

// Update a University
router.put('/:id', [authenticate], universityController.update);

// Delete a University
router.delete('/:id', [authenticate], universityController.delete);

app.use("/transcript/universities", router);
module.exports = router;
}