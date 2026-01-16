import { Router } from "express";
import transcriptCourseController from "../controllers/transcriptCourse.controller.js";
import authenticate from "../authorization/authorization.js";

const router = Router();

// Create a new TranscriptCourse
router.post("/", [authenticate], transcriptCourseController.create);

// Get all TranscriptCourses
router.get("/", [authenticate], transcriptCourseController.findAll);

// Get all TranscriptCourses for a transcript
router.get(
  "/transcript/:transcriptId",
  [authenticate],
  transcriptCourseController.getByTranscriptId
);

// Match generic courses for a transcript
router.post(
  "/transcript/:transcriptId/match-generics",
  [authenticate],
  transcriptCourseController.matchGenericCourses
);

// Get a single TranscriptCourse by id
router.get("/:id", [authenticate], transcriptCourseController.findOne);

// Update a TranscriptCourse
router.put("/:id", [authenticate], transcriptCourseController.update);

// Delete a TranscriptCourse
router.delete("/:id", [authenticate], transcriptCourseController.delete);

export default router;
