import sections from "../controllers/section.controller.js";
import authenticate from "../authorization/authorization.js";
import { Router } from "express";
var router = Router();

// Create a new Section (Admin only)
router.post("/", [authenticate], sections.create);

// Retrieve all Sections
router.get("/", [authenticate], sections.findAll);

// Retrieve all Sections with assignment count
router.get("/withCount", [authenticate], sections.findAllWithCount);

// Retrieve sections by user email
router.get("/user/:email", [authenticate], sections.findByUserEmail);// Retrieve a single Section with id
router.get("/:id", [authenticate], sections.findOne);// Update a Section with id (Admin only)
router.put("/:id", [authenticate], sections.update);// Delete a Section with id (Admin only)
router.delete("/:id", [authenticate], sections.delete);

// Import sections from CSV
router.post("/import", [authenticate], sections.importCSV);export default router;