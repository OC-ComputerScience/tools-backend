import { Router } from "express";
import assignmentGradeController from "../controllers/assignmentGrade.controller.js";
import authenticate from "../authorization/authorization.js";

const router = Router();

router.post("/import", [authenticate], assignmentGradeController.importFromCanvas);
router.post("/clear", [authenticate], assignmentGradeController.clearForSemester);
router.post("/", [authenticate], assignmentGradeController.create);
router.get("/", [authenticate], assignmentGradeController.findAll);
router.get("/:id", [authenticate], assignmentGradeController.findOne);
router.put("/:id", [authenticate], assignmentGradeController.update);
router.delete("/:id", [authenticate], assignmentGradeController.delete);

export default router;
