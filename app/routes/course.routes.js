import courses from "../controllers/course.controller.js";
import authenticate from "../authorization/authorization.js";
import { Router } from "express";
var router = Router()

// Create a new Course
router.post("/", [authenticate], courses.create);

// Retrieve all Courses (with optional termId and userId filters)
router.get("/", [authenticate], courses.findAll);

// Retrieve courses with assignment count (Admin)
router.get("/withCount", [authenticate], courses.findAllWithCount);

// Retrieve courses for a user by email
router.get("/user/:email", [authenticate], courses.findByUserEmail);

// Retrieve a single Course with id
router.get("/:id", [authenticate], courses.findOne);

// Update a Course with id
router.put("/:id", [authenticate], courses.update);

// Delete a Course with id
router.delete("/:id", [authenticate], courses.delete);

export default router;

