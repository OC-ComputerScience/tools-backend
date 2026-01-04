import { Router } from "express";
import universityController from "../controllers/university.controller.js";
import authenticate from "../authorization/authorization.js";

const router = Router();

// Create a new University
router.post("/", [authenticate], universityController.create);

// Get all Universities
router.get("/", [authenticate], universityController.findAll);

// Get a single University by id
router.get("/:id", [authenticate], universityController.findOne);

// Update a University
router.put("/:id", [authenticate], universityController.update);

// Delete a University
router.delete("/:id", [authenticate], universityController.delete);

export default router;
