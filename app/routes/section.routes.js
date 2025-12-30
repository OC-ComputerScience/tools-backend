import sections from "../controllers/section.controller.js";
import authenticate from "../authorization/authorization.js";
import { Router } from "express";
var router = Router();

// Create a new Section
router.post("/", [authenticate], sections.create);

// Retrieve all Sections (with optional termId and userId filters)
router.get("/", [authenticate], sections.findAll);

// Retrieve sections with assignment count (Admin)
router.get("/withCount", [authenticate], sections.findAllWithCount);

// Retrieve sections for a user by email
router.get("/user/:email", [authenticate], sections.findByUserEmail);

// Retrieve a single Section with id
router.get("/:id", [authenticate], sections.findOne);

// Update a Section with id
router.put("/:id", [authenticate], sections.update);

// Delete a Section with id
router.delete("/:id", [authenticate], sections.delete);

export default router;

