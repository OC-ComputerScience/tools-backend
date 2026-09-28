import { Router } from "express";
import departmentController from "../controllers/department.controller.js";
import authenticate from "../authorization/authorization.js";

const router = Router();

router.post("/", [authenticate], departmentController.create);
router.get("/", [authenticate], departmentController.findAll);
router.get(
  "/university/:universityId",
  [authenticate],
  departmentController.findAllforUniversity
);
router.get("/:id", [authenticate], departmentController.findOne);
router.put("/:id", [authenticate], departmentController.update);
router.delete("/:id", [authenticate], departmentController.delete);

export default router;
