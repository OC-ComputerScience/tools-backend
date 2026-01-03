const db = require('../models');

const OCCourse = db.OCCourse;
const UniversityCourse= db.UniversityCourse;
const University = db.University;

// Create a new UniversityCourse
exports.create = async (req, res) => {
  try {
    const universityCourse = await UniversityCourse.create(req.body);
    res.status(201).json(universityCourse);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all UniversityCourses
exports.findAll = async (req, res) => {
  try {
    const universityCourses = await UniversityCourse.findAll({
      include: [
        { model: University },
        { model: OCCourse }
      ]
    });
    res.json(universityCourses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all UniversityCourses by University
exports.findAllforUniversity = async (req, res) => {
  try {
    const universityCourses = await UniversityCourse.findAll({
      where: {universityId :req.params.universityId },
      include: [
        { model: University },
        { model: OCCourse }
      ]
    });
    res.json(universityCourses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get a single UniversityCourse by id
exports.findOne = async (req, res) => {
  try {
    const universityCourse = await UniversityCourse.findByPk(req.params.id, {
      include: [
        { model: University },
        { model: OCCourse }
      ]
    });
    if (!universityCourse) {
      return res.status(404).json({ message: 'University Course not found' });
    }
    res.json(universityCourse);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update a UniversityCourse
exports.update = async (req, res) => {
  try {
    const universityCourse = await UniversityCourse.findByPk(req.params.id);
    if (!universityCourse) {
      return res.status(404).json({ message: 'University Course not found' });
    }
    await universityCourse.update(req.body);
    res.json(universityCourse);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete a UniversityCourse
exports.delete = async (req, res) => {
  try {
    const universityCourse = await UniversityCourse.findByPk(req.params.id);
    if (!universityCourse) {
      return res.status(404).json({ message: 'University Course not found' });
    }
    await universityCourse.destroy();
    res.json({ message: 'University Course deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}; 