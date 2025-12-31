import { Router } from "express";

import AuthRoutes from "./auth.routes.js";
import UserRoutes from "./user.routes.js";
import TermRoutes from "./term.routes.js";
import CourseRoutes from "./course.routes.js";
import SectionRoutes from "./section.routes.js";
import AssignedCourseRoutes from "./assignedCourse.routes.js";
import MeetingTimeRoutes from "./meetingTime.routes.js";
import MajorRoutes from "./major.routes.js";
import SemesterPlanRoutes from "./semesterPlan.routes.js";
import RoleRoutes from "./role.routes.js";
import MenuOptionRoutes from "./menuOption.routes.js";

const router = Router();

router.use("/", AuthRoutes);
router.use("/users", UserRoutes);
router.use("/terms", TermRoutes);
router.use("/courses", CourseRoutes);
router.use("/sections", SectionRoutes);
router.use("/assignedCourses", AssignedCourseRoutes);
router.use("/meetingTimes", MeetingTimeRoutes);
router.use("/majors", MajorRoutes);
router.use("/semesterPlans", SemesterPlanRoutes);
router.use("/roles", RoleRoutes);
router.use("/menuOptions", MenuOptionRoutes);

export default router;

