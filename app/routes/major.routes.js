import majors from "../controllers/major.controller.js";
import authenticate from "../authorization/authorization.js";
import { Router } from "express";
var router = Router();

// Create a new Major (Admin only)
router.post("/", [authenticate], majors.create);

// Retrieve all Majors
router.get("/", [authenticate], majors.findAll);

// Retrieve a single Major with id
router.get("/:id", [authenticate], majors.findOne);

// Update a Major with id (Admin only)
router.put("/:id", [authenticate], majors.update);

// Delete a Major with id (Admin only)
router.delete("/:id", [authenticate], majors.delete);

export default router;
