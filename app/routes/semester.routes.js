import { Router } from "express";
import semesterController from "../controllers/semester.controller.js";

const router = Router();

// Create a new Semester
router.post("/", semesterController.create);

// Retrieve all Semesters
router.get("/", semesterController.findAll);

// Retrieve a single Semester with id
router.get("/:id", semesterController.findOne);

// Update a Semester with id
router.put("/:id", semesterController.update);

// Delete a Semester with id
router.delete("/:id", semesterController.delete);

export default router;
