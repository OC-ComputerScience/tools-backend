import { Router } from "express";
import catalogController from "../controllers/catalog.controller.js";

const router = Router();

// Get all catalogs
router.get("/", catalogController.getAll);

// Get a single catalog by ID
router.get("/:id", catalogController.getById);

// Create a new catalog
router.post("/", catalogController.create);

// Update a catalog
router.put("/:id", catalogController.update);

// Delete a catalog
router.delete("/:id", catalogController.delete);

export default router;
