import { Router } from "express";
import departmentOutcomeController from "../controllers/departmentOutcome.controller.js";
import authenticate from "../authorization/authorization.js";

const router = Router();

router.post("/", [authenticate], departmentOutcomeController.create);
router.get("/", [authenticate], departmentOutcomeController.findAll);
router.get(
  "/department/:departmentId",
  [authenticate],
  departmentOutcomeController.findAllforDepartment
);
router.get("/:id", [authenticate], departmentOutcomeController.findOne);
router.put("/:id", [authenticate], departmentOutcomeController.update);
router.delete("/:id", [authenticate], departmentOutcomeController.delete);

export default router;
