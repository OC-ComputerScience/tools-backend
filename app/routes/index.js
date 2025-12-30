import { Router } from "express";

import AuthRoutes from "./auth.routes.js";
import UserRoutes from "./user.routes.js";
import TermRoutes from "./term.routes.js";
import SectionRoutes from "./section.routes.js";
import AssignedCourseRoutes from "./assignedCourse.routes.js";
import MeetingTimeRoutes from "./meetingTime.routes.js";
import MajorRoutes from "./major.routes.js";

const router = Router();

router.use("/", AuthRoutes);
router.use("/users", UserRoutes);
router.use("/terms", TermRoutes);
router.use("/sections", SectionRoutes);
router.use("/assignedCourses", AssignedCourseRoutes);
router.use("/meetingTimes", MeetingTimeRoutes);
router.use("/majors", MajorRoutes);

export default router;

