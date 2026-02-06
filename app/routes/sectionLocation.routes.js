import sectionLocations from "../controllers/sectionLocation.controller.js";
import authenticate from "../authorization/authorization.js";
import { Router } from "express";
const router = Router();

// Create a new SectionLocation
router.post("/", [authenticate], sectionLocations.create);

// Retrieve all SectionLocations (with optional ?sectionId= filter)
router.get("/", [authenticate], sectionLocations.findAll);

// Find all locations for a specific section
router.get("/section/:sectionId", [authenticate], sectionLocations.findBySectionId);

// Find a single SectionLocation with id
router.get("/:id", [authenticate], sectionLocations.findOne);

// Update a SectionLocation with id
router.put("/:id", [authenticate], sectionLocations.update);

// Delete a SectionLocation with id
router.delete("/:id", [authenticate], sectionLocations.delete);

// Delete all locations for a specific section
router.delete("/section/:sectionId", [authenticate], sectionLocations.deleteBySectionId);

// Import section locations from CSV
router.post("/import", [authenticate], sectionLocations.importCSV);

export default router;
