import db from "../models/index.js";
import logger from "../config/logger.js";

const DepartmentOutcome = db.DepartmentOutcome;
const Semester = db.Semester;
const Assignment = db.Assignment;
const Course = db.course;
const Section = db.section;
const AssignmentGrade = db.AssignmentGrade;
const AssessmentScore = db.AssessmentScore;
const Op = db.Sequelize.Op;

const exports = {};

const normalizeKey = (value) => String(value || "").trim().toLowerCase();

const assessmentScoreRowForGrade = (gradePercentage, scale) => {
  let match = null;
  for (const row of scale) {
    const percentage = Number(row.percentage);
    if (!Number.isFinite(percentage) || percentage > gradePercentage) continue;
    if (!match || percentage > Number(match.percentage)) match = row;
  }
  return match;
};

const assessmentScoreForGrade = (gradePercentage, scale) => {
  const match = assessmentScoreRowForGrade(gradePercentage, scale);
  return match ? Number(match.score) : null;
};

const semesterIdsFromQuery = (value) =>
  String(value || "")
    .split(",")
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id));

exports.findForDepartmentSemester = async (req, res) => {
  const departmentId = req.query.departmentId;
  const semesterIds = semesterIdsFromQuery(req.query.semesterId);
  if (!departmentId || !semesterIds.length) {
    return res.status(400).json({ message: "departmentId and semesterId are required" });
  }

  try {
    logger.debug(`Department assessment for department ${departmentId}, semesters ${semesterIds.join(",")}`);

    const outcomes = await DepartmentOutcome.findAll({
      where: { departmentId },
      order: [["number", "ASC"], ["name", "ASC"]],
    });
    const outcomeIds = outcomes.map((outcome) => outcome.id);
    if (!outcomeIds.length) {
      return res.json([]);
    }

    const assignments = await Assignment.findAll({
      where: {
        departmentOutcomeId: { [Op.in]: outcomeIds },
        coreAssessment: false,
      },
      include: [{ model: Course, as: "course", attributes: ["id", "number"] }],
    });

    const courseNumbers = new Set(
      assignments.map((assignment) => normalizeKey(assignment.course?.number)).filter(Boolean)
    );
    const sections = courseNumbers.size
      ? await Section.findAll({
          where: { semesterId: { [Op.in]: semesterIds } },
          attributes: ["id", "courseNumber", "courseSection", "courseDescription", "semesterId"],
          include: [{ model: Semester, as: "semester", attributes: ["id", "name"] }],
          order: [["courseNumber", "ASC"], ["courseSection", "ASC"]],
        })
      : [];
    const matchingSections = sections.filter((section) =>
      courseNumbers.has(normalizeKey(section.courseNumber))
    );
    const sectionIds = matchingSections.map((section) => section.id);
    const sectionCourseById = new Map(
      matchingSections.map((section) => [section.id, normalizeKey(section.courseNumber)])
    );

    const assignmentIds = assignments.map((assignment) => assignment.id);
    const grades = sectionIds.length && assignmentIds.length
      ? await AssignmentGrade.findAll({
          where: {
            sectionId: { [Op.in]: sectionIds },
            assignmentId: { [Op.in]: assignmentIds },
          },
          attributes: ["assignmentId", "sectionId", "points"],
        })
      : [];

    const scale = await AssessmentScore.findAll();
    const percentageScale = scale.some((row) => Number(row.percentage) > 1);
    const formatScore = (score) => {
      const value = Number(score);
      if (!Number.isFinite(value)) return String(score);
      return Number.isInteger(value) ? String(value) : String(value);
    };
    const scoreColumns = [...new Set(
      scale.map((row) => Number(row.score)).filter((score) => Number.isFinite(score))
    )]
      .sort((a, b) => a - b)
      .map((score) => ({
        key: `score_${formatScore(score).replace(".", "_")}`,
        title: formatScore(score),
        score,
      }));
    const distributionFields = (sectionScores) => {
      const counts = Object.fromEntries(scoreColumns.map((column) => [column.key, 0]));
      for (const value of sectionScores) {
        const column = scoreColumns.find((item) => item.score === Number(value));
        if (column) counts[column.key] += 1;
      }
      return counts;
    };

    const assignmentById = new Map(assignments.map((assignment) => [assignment.id, assignment]));
    const scoresByOutcome = new Map(outcomeIds.map((id) => [Number(id), []]));
    const scoresByAssignmentSection = new Map();

    const average = (scores) =>
      scores.length
        ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100) / 100
        : null;

    for (const grade of grades) {
      const assignment = assignmentById.get(grade.assignmentId);
      if (!assignment?.departmentOutcomeId) continue;
      const assignmentCourse = normalizeKey(assignment.course?.number);
      if (!assignmentCourse || sectionCourseById.get(grade.sectionId) !== assignmentCourse) continue;

      const totalPoints = Number(assignment.totalPoints);
      const points = Number(grade.points);
      if (!Number.isFinite(totalPoints) || totalPoints <= 0 || !Number.isFinite(points)) continue;

      const ratio = points / totalPoints;
      const gradeValue = percentageScale ? ratio * 100 : ratio;
      const assessmentScore = assessmentScoreForGrade(gradeValue, scale);
      if (assessmentScore == null) continue;
      const bucket = scoresByOutcome.get(Number(assignment.departmentOutcomeId));
      if (!bucket) continue;
      bucket.push(assessmentScore);
      const scoreKey = `${assignment.id}|${grade.sectionId}`;
      if (!scoresByAssignmentSection.has(scoreKey)) scoresByAssignmentSection.set(scoreKey, []);
      scoresByAssignmentSection.get(scoreKey).push(assessmentScore);
    }

    const results = outcomes.map((outcome) => {
      const scores = scoresByOutcome.get(Number(outcome.id)) || [];
      const outcomeAssignments = [];
      for (const assignment of assignments) {
        if (Number(assignment.departmentOutcomeId) !== Number(outcome.id)) continue;
        const assignmentCourse = normalizeKey(assignment.course?.number);
        const sectionsForAssignment = assignmentCourse
          ? matchingSections.filter((section) => sectionCourseById.get(section.id) === assignmentCourse)
          : [];
        if (!sectionsForAssignment.length) {
          outcomeAssignments.push({
            id: `${assignment.id}`,
            name: assignment.name,
            courseNumber: assignment.course?.number || "",
            courseSection: "",
            courseDescription: "",
            semesterName: "",
            averageScore: null,
            gradeCount: 0,
            ...distributionFields([]),
          });
          continue;
        }
        for (const section of sectionsForAssignment) {
          const sectionScores = scoresByAssignmentSection.get(`${assignment.id}|${section.id}`) || [];
          outcomeAssignments.push({
            id: `${assignment.id}-${section.id}`,
            name: assignment.name,
            courseNumber: section.courseNumber,
            courseSection: section.courseSection,
            courseDescription: section.courseDescription,
            semesterName: section.semester?.name || "",
            averageScore: average(sectionScores),
            gradeCount: sectionScores.length,
            ...distributionFields(sectionScores),
          });
        }
      }
      outcomeAssignments.sort((a, b) => {
        const sectionCompare = `${a.semesterName} ${a.courseNumber}-${a.courseSection}`.localeCompare(
          `${b.semesterName} ${b.courseNumber}-${b.courseSection}`
        );
        if (sectionCompare) return sectionCompare;
        return String(a.name || "").localeCompare(String(b.name || ""));
      });
      return {
        id: outcome.id,
        number: outcome.number,
        name: outcome.name,
        averageScore: average(scores),
        gradeCount: scores.length,
        scoreColumns,
        ...distributionFields(scores),
        assignments: outcomeAssignments,
      };
    });

    const highestScore = results.reduce((highest, outcome) => {
      if (outcome.averageScore == null) return highest;
      return highest == null || outcome.averageScore > highest ? outcome.averageScore : highest;
    }, null);
    for (const outcome of results) {
      outcome.scoreDescription = null;
      if (outcome.averageScore == null || highestScore == null || highestScore <= 0) continue;
      const ratio = outcome.averageScore / highestScore;
      const gradeValue = percentageScale ? ratio * 100 : ratio;
      outcome.scoreDescription = assessmentScoreRowForGrade(gradeValue, scale)?.description || null;
    }

    logger.info(`Department assessment returned ${results.length} outcomes for department ${departmentId}`);
    res.json(results);
  } catch (error) {
    logger.error(`Error calculating department assessment: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

export default exports;
