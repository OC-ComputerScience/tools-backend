module.exports = (app) => {
  const transcriptController = require('../controllers/transcript.controller');
  var router = require("express").Router();
  const { authenticate } = require("../authorization/authorization.js");

  // upload transcript
  router.post('/upload/:transcriptId', [authenticate], transcriptController.uploadFile);
  
  // ocr transcript
  router.get('/ocr/:transcriptId', [authenticate], transcriptController.processOCR);

  app.use("/transcript/transcript", router);
}; 
