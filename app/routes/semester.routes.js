module.exports = (app) => {
  const semesters = require("../controllers/semester.controller.js");
  const router = require("express").Router();

  // Create a new Semester
  router.post("/", semesters.create);

  // Retrieve all Semesters
  router.get("/", semesters.findAll);

  // Retrieve a single Semester with id
  router.get("/:id", semesters.findOne);

  // Update a Semester with id
  router.put("/:id", semesters.update);

  // Delete a Semester with id
  router.delete("/:id", semesters.delete);

  app.use("/transcript/semesters", router);
}; 