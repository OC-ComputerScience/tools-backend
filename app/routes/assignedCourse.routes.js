import assignedCourses from "../controllers/assignedCourse.controller.js";
import authenticate from "../authorization/authorization.js";
import { Router } from "express";
var router = Router()

// Create a new AssignedCourse
router.post("/", [authenticate], assignedCourses.create);

// Retrieve all AssignedCourses (with optional sectionId filter)
router.get("/", [authenticate], assignedCourses.findAll);

// Retrieve assigned course for a specific section
router.get("/section/:sectionId", [authenticate], assignedCourses.findBySectionId);

// Retrieve a single AssignedCourse with id
router.get("/:id", [authenticate], assignedCourses.findOne);

// Update a AssignedCourse with id
router.put("/:id", [authenticate], assignedCourses.update);

// Delete a AssignedCourse with id
router.delete("/:id", [authenticate], assignedCourses.delete);

// Delete assigned course by sectionId
router.delete("/section/:sectionId", [authenticate], assignedCourses.deleteBySectionId);

export default router;

