import { Router } from "express";
import departmentAssessmentController from "../controllers/departmentAssessment.controller.js";
import authenticate from "../authorization/authorization.js";

const router = Router();

router.get("/", [authenticate], departmentAssessmentController.findForDepartmentSemester);

export default router;
