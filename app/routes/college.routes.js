import { Router } from "express";
import collegeController from "../controllers/college.controller.js";
import authenticate from "../authorization/authorization.js";

const router = Router();

router.post("/", [authenticate], collegeController.create);
router.get("/", [authenticate], collegeController.findAll);
router.get("/:id", [authenticate], collegeController.findOne);
router.put("/:id", [authenticate], collegeController.update);
router.delete("/:id", [authenticate], collegeController.delete);

export default router;
