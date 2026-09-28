import { Router } from "express";
import coreAssessmentController from "../controllers/coreAssessment.controller.js";
import authenticate from "../authorization/authorization.js";

const router = Router();

router.get("/", [authenticate], coreAssessmentController.findForUniversitySemester);

export default router;
