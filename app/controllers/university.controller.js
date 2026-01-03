const db = require('../models');

const University = db.University;

// Create a new University
exports.create = async (req, res) => {
  try {
    const university = await University.create(req.body);
    res.status(201).json(university);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all Universities
exports.findAll = async (req, res) => {
  try {
    const universities = await University.findAll();
    res.json(universities);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get a single University by id
exports.findOne = async (req, res) => {
  try {
    const university = await University.findByPk(req.params.id);
    if (!university) {
      return res.status(404).json({ message: 'University not found' });
    }
    res.json(university);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update a University
exports.update = async (req, res) => {
  try {
    const university = await University.findByPk(req.params.id);
    if (!university) {
      return res.status(404).json({ message: 'University not found' });
    }
    await university.update(req.body);
    res.json(university);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete a University
exports.delete = async (req, res) => {
  try {
    const university = await University.findByPk(req.params.id);
    if (!university) {
      return res.status(404).json({ message: 'University not found' });
    }
    await university.destroy();
    res.json({ message: 'University deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}; 