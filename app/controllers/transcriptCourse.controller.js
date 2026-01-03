const db = require('../models');
const TranscriptCourse = db.TranscriptCourse;
const UniversityTranscript = db.UniversityTranscript;
const UniversityCourse = db.UniversityCourse;
const OCCourse = db.OCCourse;
const Semester = db.Semester;

// Create a new TranscriptCourse
exports.create = async (req, res) => {
  try {
    const transcriptCourse = await TranscriptCourse.create(req.body);
    const createdCourse = await TranscriptCourse.findByPk(transcriptCourse.id, {
      include: [
        { model: UniversityTranscript },
        { model: UniversityCourse },
        { model: OCCourse },
        { model: Semester }
      ]
    });
    res.status(201).json(createdCourse);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all TranscriptCourses
exports.findAll = async (req, res) => {
  try {
    const transcriptCourses = await TranscriptCourse.findAll({
      include: [
        { model: UniversityTranscript },
        { model: UniversityCourse },
        { model: OCCourse },
        { model: Semester }
      ]
    });
    res.json(transcriptCourses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all TranscriptCourses by transcriptId
exports.getByTranscriptId = async (req, res) => {
  try {
    const transcriptCourses = await TranscriptCourse.findAll({
      where: {universityTranscriptId: req.params.transcriptId},
      include: [
        { model: UniversityTranscript },
        { model: UniversityCourse },
        { model: OCCourse },
        { model: Semester }
      ]
    });
    res.json(transcriptCourses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get a single TranscriptCourse by id
exports.findOne = async (req, res) => {
  try {
    const transcriptCourse = await TranscriptCourse.findByPk(req.params.id, {
      include: [
        { model: UniversityTranscript },
        { model: UniversityCourse },
        { model: OCCourse },
        { model: Semester }
      ]
    });
    if (!transcriptCourse) {
      return res.status(404).json({ message: 'Transcript Course not found' });
    }
    res.json(transcriptCourse);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update a TranscriptCourse
exports.update = async (req, res) => {
  try {
    const transcriptCourse = await TranscriptCourse.findByPk(req.params.id);
    if (!transcriptCourse) {
      return res.status(404).json({ message: 'Transcript Course not found' });
    }
    await transcriptCourse.update(req.body);
    const updatedCourse = await TranscriptCourse.findByPk(req.params.id, {
      include: [
        { model: UniversityTranscript },
        { model: UniversityCourse },
        { model: OCCourse },
        { model: Semester }
      ]
    });
    res.json(updatedCourse);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete a TranscriptCourse
exports.delete = async (req, res) => {
  try {
    const transcriptCourse = await TranscriptCourse.findByPk(req.params.id);
    if (!transcriptCourse) {
      return res.status(404).json({ message: 'Transcript Course not found' });
    }
    await transcriptCourse.destroy();
    res.json({ message: 'Transcript Course deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}; 