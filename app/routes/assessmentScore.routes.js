import { Router } from "express";
import assessmentScoreController from "../controllers/assessmentScore.controller.js";
import authenticate from "../authorization/authorization.js";

const router = Router();

router.post("/", [authenticate], assessmentScoreController.create);
router.get("/", [authenticate], assessmentScoreController.findAll);
router.get("/:id", [authenticate], assessmentScoreController.findOne);
router.put("/:id", [authenticate], assessmentScoreController.update);
router.delete("/:id", [authenticate], assessmentScoreController.delete);

export default router;
