module.exports = (app) => {
  const express = require('express');
  const router = express.Router();
  const catalogController = require('../controllers/catalog.controller');

  // Get all catalogs
  router.get('/', catalogController.getAll);

  // Get a single catalog by ID
  router.get('/:id', catalogController.getById);

  // Create a new catalog
  router.post('/', catalogController.create);

  // Update a catalog
  router.put('/:id', catalogController.update);

  // Delete a catalog
  router.delete('/:id', catalogController.delete);

  app.use("/transcript/catalogs", router);
};