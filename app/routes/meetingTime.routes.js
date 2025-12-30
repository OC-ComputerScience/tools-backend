import meetingTimes from "../controllers/meetingTime.controller.js";
import authenticate from "../authorization/authorization.js";
import { Router } from "express";
const router = Router();

// Create a new MeetingTime
router.post("/", [authenticate], meetingTimes.create);

// Retrieve all MeetingTimes (with optional ?courseId= filter)
router.get("/", [authenticate], meetingTimes.findAll);

// Find all meeting times for a specific course
router.get("/course/:courseId", [authenticate], meetingTimes.findByCourseId);

// Find a single MeetingTime with id
router.get("/:id", [authenticate], meetingTimes.findOne);

// Update a MeetingTime with id
router.put("/:id", [authenticate], meetingTimes.update);

// Delete a MeetingTime with id
router.delete("/:id", [authenticate], meetingTimes.delete);

// Delete all meeting times for a specific course
router.delete("/course/:courseId", [authenticate], meetingTimes.deleteByCourseId);

export default router;

