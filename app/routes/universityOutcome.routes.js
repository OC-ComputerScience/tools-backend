import { Router } from "express";
import universityOutcomeController from "../controllers/universityOutcome.controller.js";
import authenticate from "../authorization/authorization.js";

const router = Router();

router.post("/", [authenticate], universityOutcomeController.create);
router.get("/", [authenticate], universityOutcomeController.findAll);
router.get(
  "/university/:universityId",
  [authenticate],
  universityOutcomeController.findAllforUniversity
);
router.get("/:id", [authenticate], universityOutcomeController.findOne);
router.put("/:id", [authenticate], universityOutcomeController.update);
router.delete("/:id", [authenticate], universityOutcomeController.delete);

export default router;
