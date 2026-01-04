import roles from "../controllers/role.controller.js";
import authenticate from "../authorization/authorization.js";
import { Router } from "express";
var router = Router();

// Create a new Role (Admin only)
router.post("/", [authenticate], roles.create);

// Retrieve all Roles
router.get("/", [authenticate], roles.findAll);

// Retrieve a single Role with id
router.get("/:id", [authenticate], roles.findOne);

// Update a Role with id (Admin only)
router.put("/:id", [authenticate], roles.update);

// Delete a Role with id (Admin only)
router.delete("/:id", [authenticate], roles.delete);

export default router;




