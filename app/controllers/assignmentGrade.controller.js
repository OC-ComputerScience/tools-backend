import db from "../models/index.js";
import logger from "../config/logger.js";

const AssignmentGrade = db.AssignmentGrade;
const Section = db.section;
const Assignment = db.Assignment;
const Course = db.course;
const Semester = db.Semester;
const Op = db.Sequelize.Op;

const exports = {};

const includeRelations = [
  { model: Section, as: "section", attributes: ["id", "courseNumber", "courseSection", "courseDescription", "semesterId"] },
  { model: Assignment, as: "assignment", attributes: ["id", "name", "departmentId", "courseId"] },
];

exports.create = async (req, res) => {
  try {
    logger.debug(`Creating assignment grade with data: ${JSON.stringify(req.body)}`);
    const assignmentGrade = await AssignmentGrade.create(req.body);
    const created = await AssignmentGrade.findByPk(assignmentGrade.id, {
      include: includeRelations,
    });
    logger.info(`Assignment grade created successfully: ${assignmentGrade.id}`);
    res.status(201).json(created);
  } catch (error) {
    logger.error(`Error creating assignment grade: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

exports.findAll = async (req, res) => {
  try {
    const where = {};
    if (req.query.sectionId) where.sectionId = req.query.sectionId;
    if (req.query.assignmentId) where.assignmentId = req.query.assignmentId;
    if (req.query.studentId) where.studentId = req.query.studentId;

    logger.debug(`Fetching assignment grades with filter: ${JSON.stringify(where)}`);
    const assignmentGrades = await AssignmentGrade.findAll({
      where,
      include: includeRelations,
      order: [["studentId", "ASC"], ["id", "ASC"]],
    });
    logger.info(`Retrieved ${assignmentGrades.length} assignment grades`);
    res.json(assignmentGrades);
  } catch (error) {
    logger.error(`Error retrieving assignment grades: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

exports.findOne = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Finding assignment grade with id: ${id}`);
    const assignmentGrade = await AssignmentGrade.findByPk(id, {
      include: includeRelations,
    });
    if (!assignmentGrade) {
      logger.warn(`Assignment grade not found with id: ${id}`);
      return res.status(404).json({ message: "Assignment grade not found" });
    }
    logger.info(`Assignment grade found: ${id}`);
    res.json(assignmentGrade);
  } catch (error) {
    logger.error(`Error retrieving assignment grade ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Updating assignment grade ${id} with data: ${JSON.stringify(req.body)}`);
    const assignmentGrade = await AssignmentGrade.findByPk(id);
    if (!assignmentGrade) {
      logger.warn(`Assignment grade not found with id: ${id}`);
      return res.status(404).json({ message: "Assignment grade not found" });
    }
    await assignmentGrade.update(req.body);
    const updated = await AssignmentGrade.findByPk(id, {
      include: includeRelations,
    });
    logger.info(`Assignment grade ${id} updated successfully`);
    res.json(updated);
  } catch (error) {
    logger.error(`Error updating assignment grade ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

exports.delete = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Attempting to delete assignment grade: ${id}`);
    const assignmentGrade = await AssignmentGrade.findByPk(id);
    if (!assignmentGrade) {
      logger.warn(`Assignment grade not found with id: ${id}`);
      return res.status(404).json({ message: "Assignment grade not found" });
    }
    await assignmentGrade.destroy();
    logger.info(`Assignment grade ${id} deleted successfully`);
    res.json({ message: "Assignment grade deleted successfully" });
  } catch (error) {
    logger.error(`Error deleting assignment grade ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

const normalizeKey = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

const canvasFetchAll = async (path) => {
  const canvasDomain = (process.env.CANVAS_DOMAIN || "https://oklahomachristian.beta.instructure.com").trim().replace(/\/+$/, "");
  const apiToken = (process.env.CANVAS_API_TOKEN || "").trim();
  if (!apiToken) {
    const error = new Error("Canvas API token not configured");
    error.statusCode = 500;
    throw error;
  }

  let url = `${canvasDomain}/api/v1/${path}${path.includes("?") ? "&" : "?"}per_page=100`;
  const rows = [];

  while (url) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        "User-Agent": "OC-Tools",
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const error = new Error(`Canvas API ${response.status} ${response.statusText}`);
      error.statusCode = response.status;
      throw error;
    }

    const data = await response.json();
    if (Array.isArray(data)) rows.push(...data);

    const linkHeader = response.headers.get("Link");
    url = null;
    if (linkHeader) {
      const nextLink = linkHeader.split(",").find((link) => link.includes('rel="next"'));
      const match = nextLink && nextLink.match(/<(.*?)>/);
      if (match) url = match[1];
    }
  }

  return rows;
};

const sectionsForSemester = async (semesterId) => {
  const semester = await Semester.findByPk(semesterId);
  if (!semester) return null;
  const sections = await Section.findAll({
    where: { semesterId: semester.id },
    include: [{ model: Semester, as: "semester" }],
    order: [["courseNumber", "ASC"], ["courseSection", "ASC"]],
  });
  return { semester, sections };
};

const assignmentsByCourseNumberForSections = async (sections) => {
  const courseNumbers = new Set(
    sections.map((section) => normalizeKey(section.courseNumber)).filter(Boolean)
  );
  const catalogCourses = await Course.findAll();
  const matchingCourseIds = catalogCourses
    .filter((course) => courseNumbers.has(normalizeKey(course.number)))
    .map((course) => course.id);
  const assignments = matchingCourseIds.length
    ? await Assignment.findAll({ where: { courseId: { [Op.in]: matchingCourseIds } } })
    : [];
  const courseNumberById = new Map(
    catalogCourses.map((course) => [course.id, normalizeKey(course.number)])
  );
  const assignmentsByCourseNumber = new Map();
  assignments.forEach((assignment) => {
    const courseNumber = courseNumberById.get(assignment.courseId);
    if (!courseNumber) return;
    if (!assignmentsByCourseNumber.has(courseNumber)) {
      assignmentsByCourseNumber.set(courseNumber, []);
    }
    assignmentsByCourseNumber.get(courseNumber).push(assignment);
  });
  return assignmentsByCourseNumber;
};

exports.importFromCanvas = async (req, res) => {
  try {
    const semesterId = req.body.semesterId;
    if (!semesterId) {
      return res.status(400).json({ message: "semesterId is required" });
    }

    const context = await sectionsForSemester(semesterId);
    if (!context) {
      return res.status(404).json({ message: "Semester not found" });
    }
    if (!process.env.CANVAS_API_TOKEN) {
      return res.status(500).json({ message: "Canvas API token not configured" });
    }

    const { semester, sections } = context;
    const assignmentsByCourseNumber = await assignmentsByCourseNumberForSections(sections);
    const sectionsWithAssignments = sections.filter((section) =>
      assignmentsByCourseNumber.has(normalizeKey(section.courseNumber))
    );

    const summary = {
      semesterId: semester.id,
      semesterName: semester.name || "",
      sectionsConsidered: sectionsWithAssignments.length,
      sectionsImported: 0,
      gradesCreated: 0,
      gradesUpdated: 0,
      submissionsWithoutScore: 0,
      sectionsSkipped: [],
      unmatchedAssignments: [],
    };

    for (const section of sectionsWithAssignments) {
      const courseNumber = normalizeKey(section.courseNumber);
      const localAssignments = assignmentsByCourseNumber.get(courseNumber) || [];
      const label = `${section.courseNumber}-${section.courseSection}`;

      const sisCourseIdValue = String(section.canvasSISCourseID || section.sectionCode || "").trim();
      if (!sisCourseIdValue) {
        summary.sectionsSkipped.push({ section: label, reason: "No Canvas SIS course ID" });
        continue;
      }

      const sisCourseId = encodeURIComponent(sisCourseIdValue);
      let canvasAssignments;
      try {
        canvasAssignments = await canvasFetchAll(`courses/sis_course_id:${sisCourseId}/assignments`);
      } catch (error) {
        summary.sectionsSkipped.push({
          section: label,
          reason: `Canvas assignments request failed: ${error.message}`,
        });
        continue;
      }

      const canvasByName = new Map();
      canvasAssignments.forEach((canvasAssignment) => {
        const key = normalizeKey(canvasAssignment.name);
        if (key && !canvasByName.has(key)) canvasByName.set(key, canvasAssignment);
      });

      const existingGrades = await AssignmentGrade.findAll({ where: { sectionId: section.id } });
      const existingByKey = new Map(
        existingGrades.map((grade) => [`${grade.assignmentId}|${grade.studentId}`, grade])
      );

      let importedForSection = false;
      for (const localAssignment of localAssignments) {
        const canvasAssignment = canvasByName.get(normalizeKey(localAssignment.name));
        if (!canvasAssignment) {
          summary.unmatchedAssignments.push({ section: label, assignment: localAssignment.name });
          continue;
        }

        let submissions;
        try {
          submissions = await canvasFetchAll(
            `courses/sis_course_id:${sisCourseId}/assignments/${canvasAssignment.id}/submissions?include[]=user`
          );
        } catch (error) {
          summary.unmatchedAssignments.push({
            section: label,
            assignment: localAssignment.name,
            reason: error.message,
          });
          continue;
        }

        for (const submission of submissions) {
          if (submission.score == null || submission.score === "") {
            summary.submissionsWithoutScore += 1;
            continue;
          }
          const studentId = submission.user?.sis_user_id
            ? String(submission.user.sis_user_id)
            : submission.user_id != null
              ? String(submission.user_id)
              : "";
          if (!studentId) {
            summary.submissionsWithoutScore += 1;
            continue;
          }

          const gradeKey = `${localAssignment.id}|${studentId}`;
          const points = Number(submission.score);
          const existing = existingByKey.get(gradeKey);
          if (existing) {
            await existing.update({ points });
            summary.gradesUpdated += 1;
          } else {
            const created = await AssignmentGrade.create({
              sectionId: section.id,
              assignmentId: localAssignment.id,
              points,
              studentId,
            });
            existingByKey.set(gradeKey, created);
            summary.gradesCreated += 1;
          }
          importedForSection = true;
        }
      }

      if (importedForSection) summary.sectionsImported += 1;
    }

    logger.info(`Canvas grade import for semester ${semester.id}: created ${summary.gradesCreated}, updated ${summary.gradesUpdated}`);
    res.json(summary);
  } catch (error) {
    logger.error(`Error importing Canvas grades: ${error.message}`);
    res.status(error.statusCode || 500).json({ message: error.message });
  }
};

exports.clearForSemester = async (req, res) => {
  try {
    const semesterId = req.body.semesterId;
    if (!semesterId) {
      return res.status(400).json({ message: "semesterId is required" });
    }

    const context = await sectionsForSemester(semesterId);
    if (!context) {
      return res.status(404).json({ message: "Semester not found" });
    }

    const sectionIds = context.sections.map((section) => section.id);
    const deleted = sectionIds.length
      ? await AssignmentGrade.destroy({ where: { sectionId: { [Op.in]: sectionIds } } })
      : 0;

    logger.info(`Cleared ${deleted} assignment grades for semester ${context.semester.id}`);
    res.json({
      semesterId: context.semester.id,
      semesterName: context.semester.name || "",
      sections: sectionIds.length,
      deleted,
    });
  } catch (error) {
    logger.error(`Error clearing assignment grades: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

export default exports;
