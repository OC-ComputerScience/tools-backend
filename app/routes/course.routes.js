import courses from "../controllers/course.controller.js";
import authenticate from "../authorization/authorization.js";
import { Router } from "express";
var router = Router();

// Create a new Course (Admin only)
router.post("/", [authenticate], courses.create);

// Retrieve all Courses
router.get("/", [authenticate], courses.findAll);

// Retrieve a single Course with id
router.get("/:id", [authenticate], courses.findOne);

// Update a Course with id (Admin only)
router.put("/:id", [authenticate], courses.update);

// Delete a Course with id (Admin only)
router.delete("/:id", [authenticate], courses.delete);

export default router;
