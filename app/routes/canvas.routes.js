import canvas from "../controllers/canvas.controller.js";
// import authenticate from "../authorization/authorization.js";
import { Router } from "express";
const router = Router()


router.get(
    "/:courseId",
    // [authenticate],
    canvas.modules
);

router.get(
    "/:courseId/module/:moduleId",
    // [authenticate],
    canvas.modules2
);

// Retrieve module items as JSON for AJAX requests
router.get(
    "/:courseId/module/:moduleId/items",
    // [authenticate],
    canvas.modules2Json
);

export default router;