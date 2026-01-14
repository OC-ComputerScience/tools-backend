import menuOptions from "../controllers/menuOption.controller.js";
import authenticate from "../authorization/authorization.js";
import { Router } from "express";
var router = Router();

// Create a new MenuOption (Admin only)
router.post("/", [authenticate], menuOptions.create);

// Retrieve all MenuOptions
router.get("/", [authenticate], menuOptions.findAll);

// Retrieve a single MenuOption with id
router.get("/:id", [authenticate], menuOptions.findOne);

// Update a MenuOption with id (Admin only)
router.put("/:id", [authenticate], menuOptions.update);

// Delete a MenuOption with id (Admin only)
router.delete("/:id", [authenticate], menuOptions.delete);

export default router;




