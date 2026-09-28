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
import UniversityOutcomeRoutes from "./universityOutcome.routes.js";
import DepartmentRoutes from "./department.routes.js";
import CollegeRoutes from "./college.routes.js";
import DepartmentOutcomeRoutes from "./departmentOutcome.routes.js";
import AssignmentRoutes from "./assignment.routes.js";
import AssignmentGradeRoutes from "./assignmentGrade.routes.js";
import AssessmentScoreRoutes from "./assessmentScore.routes.js";
import DepartmentAssessmentRoutes from "./departmentAssessment.routes.js";
import CollegeOutcomeRoutes from "./collegeOutcome.routes.js";
import UniversityAssessmentRoutes from "./universityAssessment.routes.js";
import UniversityTranscriptRoutes from "./universityTranscript.routes.js";
import TranscriptCourseRoutes from "./transcriptCourse.routes.js";
import CatalogRoutes from "./catalog.routes.js";
import SemesterRoutes from "./semester.routes.js";
import TranscriptRoutes from "./transcript.routes.js";
import PrefixKeywordRoutes from "./prefixKeyword.routes.js";
import SectionLocationRoutes from "./sectionLocation.routes.js";
import CanvasRoutes from "./canvas.routes.js";

const router = Router();

// Routes
router.use("/", AuthRoutes);
router.use("/users", UserRoutes);
router.use("/courses", CourseRoutes);
router.use("/sections", SectionRoutes);
router.use("/assignedCourses", AssignedCourseRoutes);
router.use("/canvas", CanvasRoutes);
router.use("/meetingTimes", MeetingTimeRoutes);
router.use("/majors", MajorRoutes);
router.use("/semesterPlans", SemesterPlanRoutes);
router.use("/roles", RoleRoutes);
router.use("/userSections", UserSectionRoutes);
router.use("/menuOptions", MenuOptionRoutes);

// Transcript routes
router.use("/universities", UniversityRoutes);
router.use("/universityCourses", UniversityCourseRoutes);
router.use("/universityOutcomes", UniversityOutcomeRoutes);
router.use("/departments", DepartmentRoutes);
router.use("/colleges", CollegeRoutes);
router.use("/departmentOutcomes", DepartmentOutcomeRoutes);
router.use("/assignments", AssignmentRoutes);
router.use("/assignmentGrades", AssignmentGradeRoutes);
router.use("/assessmentScores", AssessmentScoreRoutes);
router.use("/departmentAssessments", DepartmentAssessmentRoutes);
router.use("/collegeOutcomes", CollegeOutcomeRoutes);
router.use("/universityAssessments", UniversityAssessmentRoutes);
router.use("/universityTranscripts", UniversityTranscriptRoutes);
router.use("/transcriptCourses", TranscriptCourseRoutes);
router.use("/catalogs", CatalogRoutes);
router.use("/semesters", SemesterRoutes);
router.use("/transcript", TranscriptRoutes);
router.use("/prefixKeywords", PrefixKeywordRoutes);
router.use("/sectionLocations", SectionLocationRoutes);

export default router;

