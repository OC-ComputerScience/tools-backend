import { Router } from "express";

import AuthRoutes from "./auth.routes.js";
import UserRoutes from "./user.routes.js";
import CourseRoutes from "./course.routes.js";
import SectionRoutes from "./section.routes.js";
import AssignedCourseRoutes from "./assignedCourse.routes.js";
import MeetingTimeRoutes from "./meetingTime.routes.js";
import MajorRoutes from "./major.routes.js";
import SemesterPlanRoutes from "./semesterPlan.routes.js";
import RoleRoutes from "./role.routes.js";
import UserSectionRoutes from "./userSection.routes.js";
import MenuOptionRoutes from "./menuOption.routes.js";
import UniversityRoutes from "./university.routes.js";
import UniversityCourseRoutes from "./universityCourse.routes.js";
import UniversityTranscriptRoutes from "./universityTranscript.routes.js";
import TranscriptCourseRoutes from "./transcriptCourse.routes.js";
import CatalogRoutes from "./catalog.routes.js";
import SemesterRoutes from "./semester.routes.js";
import TranscriptRoutes from "./transcript.routes.js";

const router = Router();

// Routes
router.use("/", AuthRoutes);
router.use("/users", UserRoutes);
router.use("/courses", CourseRoutes);
router.use("/sections", SectionRoutes);
router.use("/assignedCourses", AssignedCourseRoutes);
router.use("/meetingTimes", MeetingTimeRoutes);
router.use("/majors", MajorRoutes);
router.use("/semesterPlans", SemesterPlanRoutes);
router.use("/roles", RoleRoutes);
router.use("/userSections", UserSectionRoutes);
router.use("/menuOptions", MenuOptionRoutes);

// Transcript routes
router.use("/universities", UniversityRoutes);
router.use("/universityCourses", UniversityCourseRoutes);
router.use("/universityTranscripts", UniversityTranscriptRoutes);
router.use("/transcriptCourses", TranscriptCourseRoutes);
router.use("/catalogs", CatalogRoutes);
router.use("/semesters", SemesterRoutes);
router.use("/transcript", TranscriptRoutes);

export default router;

