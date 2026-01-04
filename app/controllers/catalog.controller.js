import db from "../models/index.js";
import logger from "../config/logger.js";

const Catalog = db.Catalog;
const Semester = db.Semester;

const exports = {};

// Get all catalogs with their associated semesters
exports.getAll = async (req, res) => {
  try {
    logger.debug("Fetching all catalogs");
    const catalogs = await Catalog.findAll({
      include: [
        {
          model: Semester,
          as: "startSemester",
        },
        {
          model: Semester,
          as: "endSemester",
        },
      ],
    });
    logger.info(`Retrieved ${catalogs.length} catalogs`);
    res.json(catalogs);
  } catch (error) {
    logger.error(`Error fetching catalogs: ${error.message}`);
    res.status(500).json({ message: "Error fetching catalogs" });
  }
};

// Get a single catalog by ID
exports.getById = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Finding catalog with id: ${id}`);
    const catalog = await Catalog.findByPk(id, {
      include: [
        {
          model: Semester,
          as: "startSemester",
        },
        {
          model: Semester,
          as: "endSemester",
        },
      ],
    });
    if (!catalog) {
      logger.warn(`Catalog not found with id: ${id}`);
      return res.status(404).json({ message: "Catalog not found" });
    }
    logger.info(`Catalog found: ${id}`);
    res.json(catalog);
  } catch (error) {
    logger.error(`Error fetching catalog ${id}: ${error.message}`);
    res.status(500).json({ message: "Error fetching catalog" });
  }
};

// Create a new catalog
exports.create = async (req, res) => {
  try {
    const { name, startSemesterId, endSemesterId } = req.body;

    if (!name || !startSemesterId || !endSemesterId) {
      logger.warn("Catalog creation attempt with missing required fields");
      return res.status(400).json({ message: "Name, start semester ID, and end semester ID are required" });
    }

    logger.debug(`Creating catalog: ${name}`);

    // Validate that both semesters exist
    const [startSemester, endSemester] = await Promise.all([
      Semester.findByPk(startSemesterId),
      Semester.findByPk(endSemesterId),
    ]);

    if (!startSemester || !endSemester) {
      logger.warn(`Invalid semester IDs: startSemesterId=${startSemesterId}, endSemesterId=${endSemesterId}`);
      return res.status(400).json({ message: "Invalid semester IDs" });
    }

    const catalog = await Catalog.create({
      name,
      startSemesterId,
      endSemesterId,
    });

    // Fetch the created catalog with its associations
    const createdCatalog = await Catalog.findByPk(catalog.id, {
      include: [
        {
          model: Semester,
          as: "startSemester",
        },
        {
          model: Semester,
          as: "endSemester",
        },
      ],
    });

    logger.info(`Catalog created successfully: ${catalog.id} - ${name}`);
    res.status(201).json(createdCatalog);
  } catch (error) {
    logger.error(`Error creating catalog: ${error.message}`);
    res.status(500).json({ message: "Error creating catalog" });
  }
};

// Update a catalog
exports.update = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Updating catalog ${id} with data: ${JSON.stringify(req.body)}`);
    const { name, startSemesterId, endSemesterId } = req.body;
    const catalog = await Catalog.findByPk(id);

    if (!catalog) {
      logger.warn(`Catalog not found with id: ${id}`);
      return res.status(404).json({ message: "Catalog not found" });
    }

    // Validate that both semesters exist
    const [startSemester, endSemester] = await Promise.all([
      Semester.findByPk(startSemesterId),
      Semester.findByPk(endSemesterId),
    ]);

    if (!startSemester || !endSemester) {
      logger.warn(`Invalid semester IDs for catalog ${id}: startSemesterId=${startSemesterId}, endSemesterId=${endSemesterId}`);
      return res.status(400).json({ message: "Invalid semester IDs" });
    }

    await catalog.update({
      name,
      startSemesterId,
      endSemesterId,
    });

    // Fetch the updated catalog with its associations
    const updatedCatalog = await Catalog.findByPk(catalog.id, {
      include: [
        {
          model: Semester,
          as: "startSemester",
        },
        {
          model: Semester,
          as: "endSemester",
        },
      ],
    });

    logger.info(`Catalog ${id} updated successfully`);
    res.json(updatedCatalog);
  } catch (error) {
    logger.error(`Error updating catalog ${id}: ${error.message}`);
    res.status(500).json({ message: "Error updating catalog" });
  }
};

// Delete a catalog
exports.delete = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Attempting to delete catalog: ${id}`);
    const catalog = await Catalog.findByPk(id);
    if (!catalog) {
      logger.warn(`Catalog not found with id: ${id}`);
      return res.status(404).json({ message: "Catalog not found" });
    }
    await catalog.destroy();
    logger.info(`Catalog ${id} deleted successfully`);
    res.json({ message: "Catalog deleted successfully" });
  } catch (error) {
    logger.error(`Error deleting catalog ${id}: ${error.message}`);
    res.status(500).json({ message: "Error deleting catalog" });
  }
};

export default exports;
