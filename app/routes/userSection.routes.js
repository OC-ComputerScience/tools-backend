import userSectionController from "../controllers/userSection.controller.js";
import authenticate from "../authorization/authorization.js";
import { Router } from "express";
const router = Router();

// Create a new user-section assignment
router.post("/", [authenticate], userSectionController.create);

// Retrieve all user-section assignments
router.get("/", [authenticate], userSectionController.findAll);

// Get unique faculty counts (must be before /user/:userId)
router.get("/faculty-stats", [authenticate], userSectionController.getFacultyStats);

// Find all sections for a specific user
router.get("/user/:userId", [authenticate], userSectionController.findByUser);

// Find all users for a specific section
router.get("/section/:sectionId", [authenticate], userSectionController.findBySection);

// Delete a user-section assignment by id
router.delete("/:id", [authenticate], userSectionController.delete);

// Delete a user-section assignment by userId and sectionId
router.delete("/user/:userId/section/:sectionId", [authenticate], userSectionController.deleteByUserAndSection);

// Import user sections from CSV
router.post("/import", [authenticate], userSectionController.importCSV);

export default router;

