import { Router } from "express";
import universityCourseController from "../controllers/universityCourse.controller.js";
import authenticate from "../authorization/authorization.js";

const router = Router();

// Create a new UniversityCourse
router.post("/", [authenticate], universityCourseController.create);

// Get all UniversityCourses
router.get("/", [authenticate], universityCourseController.findAll);

// Get all UniversityCourses for a university
router.get(
  "/university/:universityId",
  [authenticate],
  universityCourseController.findAllforUniversity
);

// Get a single UniversityCourse by id
router.get("/:id", [authenticate], universityCourseController.findOne);

// Update a UniversityCourse
router.put("/:id", [authenticate], universityCourseController.update);

// Delete a UniversityCourse
router.delete("/:id", [authenticate], universityCourseController.delete);

export default router;
