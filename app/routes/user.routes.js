import users from "../controllers/user.controller.js";
import authenticate from "../authorization/authorization.js";
import { Router } from "express";
var router = Router()

// Retrieve all Users (Admin only)
router.get("/", [authenticate], users.findAll);

// Retrieve a single User with id
router.get("/:id", [authenticate], users.findOne);

// Update a User with id
router.put("/:id", [authenticate], users.update);

// Import users from CSV
router.post("/import", [authenticate], users.importCSV);

export default router;

