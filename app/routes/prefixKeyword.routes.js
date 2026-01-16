import prefixKeywords from "../controllers/prefixKeyword.controller.js";
import authenticate from "../authorization/authorization.js";
import { Router } from "express";
var router = Router();

// Create a new PrefixKeyword (Admin only)
router.post("/", [authenticate], prefixKeywords.create);

// Retrieve all PrefixKeywords
router.get("/", [authenticate], prefixKeywords.findAll);

// Retrieve a single PrefixKeyword with id
router.get("/:id", [authenticate], prefixKeywords.findOne);

// Update a PrefixKeyword with id (Admin only)
router.put("/:id", [authenticate], prefixKeywords.update);

// Delete a PrefixKeyword with id (Admin only)
router.delete("/:id", [authenticate], prefixKeywords.delete);

export default router;
