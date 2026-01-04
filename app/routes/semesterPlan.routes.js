import semesterPlans from "../controllers/semesterPlan.controller.js";
import authenticate from "../authorization/authorization.js";
import { Router } from "express";
var router = Router();

// Create a new SemesterPlan (Admin only)
router.post("/", [authenticate], semesterPlans.create);

// Retrieve all SemesterPlans (with optional majorId and semesterNumber filters)
router.get("/", [authenticate], semesterPlans.findAll);

// Retrieve a single SemesterPlan with id
router.get("/:id", [authenticate], semesterPlans.findOne);

// Update a SemesterPlan with id (Admin only)
router.put("/:id", [authenticate], semesterPlans.update);

// Delete a SemesterPlan with id (Admin only)
router.delete("/:id", [authenticate], semesterPlans.delete);

export default router;




