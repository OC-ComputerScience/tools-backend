import terms from "../controllers/term.controller.js";
import authenticate from "../authorization/authorization.js";
import { Router } from "express";
var router = Router()

// Create a new Term (Admin only)
router.post("/", [authenticate], terms.create);

// Retrieve all Terms
router.get("/", [authenticate], terms.findAll);

// Retrieve a single Term with id
router.get("/:id", [authenticate], terms.findOne);

// Update a Term with id (Admin only)
router.put("/:id", [authenticate], terms.update);

// Delete a Term with id (Admin only)
router.delete("/:id", [authenticate], terms.delete);

export default router;

