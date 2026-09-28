import { Router } from "express";
import collegeOutcomeController from "../controllers/collegeOutcome.controller.js";
import authenticate from "../authorization/authorization.js";

const router = Router();

router.get("/", [authenticate], collegeOutcomeController.findForCollegeSemester);

export default router;
