import { Router } from "express";

import AuthRoutes from "./auth.routes.js";
import UserRoutes from "./user.routes.js";
import TermRoutes from "./term.routes.js";
import CourseRoutes from "./course.routes.js";
import AssignedCourseRoutes from "./assignedCourse.routes.js";
import MeetingTimeRoutes from "./meetingTime.routes.js";

const router = Router();

router.use("/", AuthRoutes);
router.use("/users", UserRoutes);
router.use("/terms", TermRoutes);
router.use("/courses", CourseRoutes);
router.use("/assignedCourses", AssignedCourseRoutes);
router.use("/meetingTimes", MeetingTimeRoutes);

export default router;

