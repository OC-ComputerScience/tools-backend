import db from "../models/index.js";
import logger from "../config/logger.js";

const College = db.College;
const Department = db.Department;
const DepartmentOutcome = db.DepartmentOutcome;
const UniversityOutcome = db.UniversityOutcome;
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

const average = (scores) =>
  scores.length
    ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100) / 100
    : null;

const weightedAverage = (rows) => {
  const included = rows.filter((row) => {
    const weight = Number(row.assessmentWeight);
    return row.averageScore != null && Number.isFinite(weight) && weight > 0;
  });
  const weightTotal = included.reduce((sum, row) => sum + Number(row.assessmentWeight), 0);
  if (!weightTotal) return null;
  const weighted = included.reduce(
    (sum, row) => sum + row.averageScore * Number(row.assessmentWeight),
    0
  ) / weightTotal;
  return Math.round(weighted * 100) / 100;
};

const semesterIdsFromQuery = (value) =>
  String(value || "")
    .split(",")
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id));

exports.findForCollegeSemester = async (req, res) => {
  const collegeId = req.query.collegeId;
  const semesterIds = semesterIdsFromQuery(req.query.semesterId);
  if (!collegeId || !semesterIds.length) {
    return res.status(400).json({ message: "collegeId and semesterId are required" });
  }

  try {
    logger.debug(`College outcomes for college ${collegeId}, semesters ${semesterIds.join(",")}`);

    const college = await College.findByPk(collegeId);
    if (!college) {
      return res.status(404).json({ message: "College not found" });
    }

    const outcomeRows = await UniversityOutcome.findAll({
      where: { universityId: college.universityId },
      attributes: ["id", "universityId", "number", "name"],
    });
    if (!outcomeRows.length) {
      return res.json([]);
    }
    const universityOutcomes = new Map(outcomeRows.map((outcome) => [outcome.id, outcome]));

    const departments = await Department.findAll({
      where: { collegeId },
      attributes: ["id", "code", "name", "assessmentWeight"],
      order: [["code", "ASC"], ["name", "ASC"]],
    });
    const departmentIds = departments.map((department) => department.id);

    const departmentOutcomes = departmentIds.length
      ? await DepartmentOutcome.findAll({
          where: { departmentId: { [Op.in]: departmentIds } },
          include: [{
            model: UniversityOutcome,
            as: "universityOutcomes",
            attributes: ["id", "universityId", "number", "name"],
            through: { attributes: [] },
          }],
        })
      : [];

    const universityOutcomeIdsByDepartmentOutcome = new Map();
    for (const departmentOutcome of departmentOutcomes) {
      const linked = (departmentOutcome.universityOutcomes || []).filter(
        (outcome) => Number(outcome.universityId) === Number(college.universityId)
      );
      universityOutcomeIdsByDepartmentOutcome.set(
        Number(departmentOutcome.id),
        linked.map((outcome) => Number(outcome.id))
      );
    }

    const departmentOutcomeIds = departmentOutcomes
      .filter((outcome) => (universityOutcomeIdsByDepartmentOutcome.get(Number(outcome.id)) || []).length)
      .map((outcome) => outcome.id);

    const assignments = departmentOutcomeIds.length
      ? await Assignment.findAll({
          where: { departmentOutcomeId: { [Op.in]: departmentOutcomeIds } },
          include: [{ model: Course, as: "course", attributes: ["id", "number"] }],
        })
      : [];
    const courseNumbers = new Set(
      assignments.map((assignment) => normalizeKey(assignment.course?.number)).filter(Boolean)
    );
    const sections = courseNumbers.size
      ? await Section.findAll({
          where: { semesterId: { [Op.in]: semesterIds } },
          attributes: ["id", "courseNumber"],
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
    const assignmentById = new Map(assignments.map((assignment) => [assignment.id, assignment]));
    const scoresByDepartmentOutcome = new Map(departmentOutcomeIds.map((id) => [Number(id), []]));

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
      const bucket = scoresByDepartmentOutcome.get(Number(assignment.departmentOutcomeId));
      if (!bucket) continue;
      bucket.push(assessmentScore);
    }

    const results = [...universityOutcomes.values()].map((universityOutcome) => {
      const departmentScores = [];
      for (const department of departments) {
        const linkedIds = departmentOutcomes
          .filter((outcome) => Number(outcome.departmentId) === Number(department.id))
          .map((outcome) => Number(outcome.id))
          .filter((id) =>
            (universityOutcomeIdsByDepartmentOutcome.get(id) || []).includes(Number(universityOutcome.id))
          );
        if (!linkedIds.length) continue;
        const departmentScoreList = linkedIds.flatMap(
          (id) => scoresByDepartmentOutcome.get(id) || []
        );
        departmentScores.push({
          id: department.id,
          code: department.code,
          name: department.name,
          assessmentWeight: department.assessmentWeight,
          averageScore: average(departmentScoreList),
          gradeCount: departmentScoreList.length,
        });
      }
      const includedDepartments = departmentScores.filter((department) => {
        const weight = Number(department.assessmentWeight);
        return department.averageScore != null && Number.isFinite(weight) && weight > 0;
      });
      return {
        id: universityOutcome.id,
        number: universityOutcome.number,
        name: universityOutcome.name,
        averageScore: weightedAverage(departmentScores),
        gradeCount: includedDepartments.reduce((sum, department) => sum + department.gradeCount, 0),
        departments: departmentScores,
      };
    }).sort((a, b) => {
      const numberCompare = String(a.number || "").localeCompare(String(b.number || ""), undefined, {
        numeric: true,
        sensitivity: "base",
      });
      if (numberCompare) return numberCompare;
      return String(a.name || "").localeCompare(String(b.name || ""));
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

    logger.info(`College outcomes returned ${results.length} university outcomes for college ${collegeId}`);
    res.json(results);
  } catch (error) {
    logger.error(`Error calculating college outcomes: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

export default exports;
