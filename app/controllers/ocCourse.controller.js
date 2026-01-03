const db = require('../models');
const OCCourse = db.OCCourse;

// Create a new OCCourse
exports.create = async (req, res) => {
  try {
    const ocCourse = await OCCourse.create(req.body);
    res.status(201).json(ocCourse);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all OCCourses
exports.findAll = async (req, res) => {
  try {
    const ocCourses = await OCCourse.findAll();
    res.json(ocCourses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get a single OCCourse by id
exports.findOne = async (req, res) => {
  try {
    const ocCourse = await OCCourse.findByPk(req.params.id);
    if (!ocCourse) {
      return res.status(404).json({ message: 'OC Course not found' });
    }
    res.json(ocCourse);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update an OCCourse
exports.update = async (req, res) => {
  try {
    const ocCourse = await OCCourse.findByPk(req.params.id);
    if (!ocCourse) {
      return res.status(404).json({ message: 'OC Course not found' });
    }
    await ocCourse.update(req.body);
    res.json(ocCourse);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete an OCCourse
exports.delete = async (req, res) => {
  try {
    const ocCourse = await OCCourse.findByPk(req.params.id);
    if (!ocCourse) {
      return res.status(404).json({ message: 'OC Course not found' });
    }
    await ocCourse.destroy();
    res.json({ message: 'OC Course deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}; 