import { Router } from "express";
import universityAssessmentController from "../controllers/universityAssessment.controller.js";
import authenticate from "../authorization/authorization.js";

const router = Router();

router.get("/", [authenticate], universityAssessmentController.findForUniversitySemester);

export default router;
