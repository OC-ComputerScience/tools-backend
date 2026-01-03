const { Catalog, Semester } = require('../models');

// Get all catalogs with their associated semesters
exports.getAll = async (req, res) => {
  try {
    const catalogs = await Catalog.findAll({
      include: [
        {
          model: Semester,
          as: 'startSemester'
        },
        {
          model: Semester,
          as: 'endSemester'
        }
      ]
    });
    res.json(catalogs);
  } catch (error) {
    console.error('Error fetching catalogs:', error);
    res.status(500).json({ message: 'Error fetching catalogs' });
  }
};

// Get a single catalog by ID
exports.getById = async (req, res) => {
  try {
    const catalog = await Catalog.findByPk(req.params.id, {
      include: [
        {
          model: Semester,
          as: 'startSemester'
        },
        {
          model: Semester,
          as: 'endSemester'
        }
      ]
    });
    if (!catalog) {
      return res.status(404).json({ message: 'Catalog not found' });
    }
    res.json(catalog);
  } catch (error) {
    console.error('Error fetching catalog:', error);
    res.status(500).json({ message: 'Error fetching catalog' });
  }
};

// Create a new catalog
exports.create = async (req, res) => {
  try {
    const { name, startSemesterId, endSemesterId } = req.body;
    
    // Validate that both semesters exist
    const [startSemester, endSemester] = await Promise.all([
      Semester.findByPk(startSemesterId),
      Semester.findByPk(endSemesterId)
    ]);

    if (!startSemester || !endSemester) {
      return res.status(400).json({ message: 'Invalid semester IDs' });
    }

    const catalog = await Catalog.create({
      name,
      startSemesterId,
      endSemesterId
    });

    // Fetch the created catalog with its associations
    const createdCatalog = await Catalog.findByPk(catalog.id, {
      include: [
        {
          model: Semester,
          as: 'startSemester'
        },
        {
          model: Semester,
          as: 'endSemester'
        }
      ]
    });

    res.status(201).json(createdCatalog);
  } catch (error) {
    console.error('Error creating catalog:', error);
    res.status(500).json({ message: 'Error creating catalog' });
  }
};

// Update a catalog
exports.update = async (req, res) => {
  try {
    const { name, startSemesterId, endSemesterId } = req.body;
    const catalog = await Catalog.findByPk(req.params.id);

    if (!catalog) {
      return res.status(404).json({ message: 'Catalog not found' });
    }

    // Validate that both semesters exist
    const [startSemester, endSemester] = await Promise.all([
      Semester.findByPk(startSemesterId),
      Semester.findByPk(endSemesterId)
    ]);

    if (!startSemester || !endSemester) {
      return res.status(400).json({ message: 'Invalid semester IDs' });
    }

    await catalog.update({
      name,
      startSemesterId,
      endSemesterId
    });

    // Fetch the updated catalog with its associations
    const updatedCatalog = await Catalog.findByPk(catalog.id, {
      include: [
        {
          model: Semester,
          as: 'startSemester'
        },
        {
          model: Semester,
          as: 'endSemester'
        }
      ]
    });

    res.json(updatedCatalog);
  } catch (error) {
    console.error('Error updating catalog:', error);
    res.status(500).json({ message: 'Error updating catalog' });
  }
};

// Delete a catalog
exports.delete = async (req, res) => {
  try {
    const catalog = await Catalog.findByPk(req.params.id);
    if (!catalog) {
      return res.status(404).json({ message: 'Catalog not found' });
    }
    await catalog.destroy();
    res.json({ message: 'Catalog deleted successfully' });
  } catch (error) {
    console.error('Error deleting catalog:', error);
    res.status(500).json({ message: 'Error deleting catalog' });
  }
}; 