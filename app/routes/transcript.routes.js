import { Router } from "express";
import transcriptController from "../controllers/transcript.controller.js";
import authenticate from "../authorization/authorization.js";

const router = Router();

// Upload transcript
router.post(
  "/upload/:transcriptId",
  [authenticate],
  transcriptController.uploadFile
);

// OCR transcript
router.get(
  "/ocr/:transcriptId",
  [authenticate],
  transcriptController.processOCR
);

export default router;
