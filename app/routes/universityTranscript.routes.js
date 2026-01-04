import { Router } from "express";
import universityTranscriptController from "../controllers/universityTranscript.controller.js";
import authenticate from "../authorization/authorization.js";

const router = Router();

// Create a new UniversityTranscript
router.post("/", [authenticate], universityTranscriptController.create);

// Get all UniversityTranscripts
router.get("/", [authenticate], universityTranscriptController.findAll);

// Get a single UniversityTranscript by id
router.get("/:id", [authenticate], universityTranscriptController.findOne);

// Update a UniversityTranscript
router.put("/:id", [authenticate], universityTranscriptController.update);

// Delete a UniversityTranscript
router.delete("/:id", [authenticate], universityTranscriptController.delete);

export default router;
