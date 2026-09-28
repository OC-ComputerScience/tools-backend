import { Router } from "express";
import assignmentController from "../controllers/assignment.controller.js";
import authenticate from "../authorization/authorization.js";

const router = Router();

router.post("/", [authenticate], assignmentController.create);
router.get("/", [authenticate], assignmentController.findAll);
router.get(
  "/department/:departmentId",
  [authenticate],
  assignmentController.findAllforDepartment
);
router.get("/:id", [authenticate], assignmentController.findOne);
router.put("/:id", [authenticate], assignmentController.update);
router.delete("/:id", [authenticate], assignmentController.delete);

export default router;
