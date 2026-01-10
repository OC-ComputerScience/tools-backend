import db  from "../models/index.js";
import logger from "../config/logger.js";
import multer from "multer";
import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const User = db.user;
const Role = db.role;
const UserRole = db.userRole;
const Op = db.Sequelize.Op;
const exports = {};

// Configure multer for CSV file upload (memory storage for CSV)
const csvUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: function (req, file, cb) {
    if (file.mimetype === "text/csv" || file.mimetype === "application/vnd.ms-excel" || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files are allowed"));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
}).single("file");

// Retrieve all Users from the database
exports.findAll = (req, res) => {
  logger.debug('Fetching all users');

  User.findAll({
    include: [
      {
        model: Role,
        as: "roles",
        attributes: ["id", "name", "description"],
        through: { attributes: [] }, // Exclude join table attributes
      },
    ],
  })
    .then((data) => {
      logger.info(`Retrieved ${data.length} users`);
      res.send(data);
    })
    .catch((err) => {
      logger.error(`Error retrieving users: ${err.message}`);
      res.status(500).send({
        message: err.message || "Some error occurred while retrieving users.",
      });
    });
};

// Find a single User with an id
exports.findOne = (req, res) => {
  const id = req.params.id;

  logger.debug(`Finding user with id: ${id}`);

  User.findByPk(id, {
    include: [
      {
        model: Role,
        as: "roles",
        attributes: ["id", "name", "description"],
        through: { attributes: [] }, // Exclude join table attributes
      },
    ],
  })
    .then((data) => {
      if (data) {
        logger.info(`User found: ${id}`);
        res.send(data);
      } else {
        logger.warn(`User not found with id: ${id}`);
        res.status(404).send({
          message: `Cannot find User with id=${id}.`,
        });
      }
    })
    .catch((err) => {
      logger.error(`Error retrieving user ${id}: ${err.message}`);
      res.status(500).send({
        message: "Error retrieving User with id=" + id,
      });
    });
};

// Update a User by the id in the request
exports.update = async (req, res) => {
  const id = req.params.id;

  logger.debug(`Updating user ${id} with data: ${JSON.stringify(req.body)}`);

  try {
    // Extract roleIds and roles from request body if present (roles is the populated array, we only want roleIds)
    const { roleIds, roles, ...userData } = req.body;

    // Update user fields (excluding roleIds)
    const [num] = await User.update(userData, {
      where: { id: id },
    });

    if (num !== 1) {
      logger.warn(`Failed to update user ${id} - not found or empty body`);
      return res.send({
        message: `Cannot update User with id=${id}. Maybe User was not found or req.body is empty!`,
      });
    }

    // If roleIds are provided, update the user's roles
    if (roleIds !== undefined && Array.isArray(roleIds)) {
      const user = await User.findByPk(id);
      if (!user) {
        return res.status(404).send({
          message: `Cannot find User with id=${id}.`,
        });
      }

      // Set roles using the roleIds array
      // Sequelize will automatically handle adding/removing associations
      const roles = await Role.findAll({
        where: { id: { [Op.in]: roleIds } },
      });
      await user.setRoles(roles);

      logger.info(`User ${id} roles updated: ${roleIds.join(", ")}`);
    }

    // Fetch updated user with roles
    const updatedUser = await User.findByPk(id, {
      include: [
        {
          model: Role,
          as: "roles",
          attributes: ["id", "name", "description"],
          through: { attributes: [] },
        },
      ],
    });

    logger.info(`User ${id} updated successfully`);
    res.send(updatedUser);
  } catch (err) {
    logger.error(`Error updating user ${id}: ${err.message}`);
    res.status(500).send({
      message: "Error updating User with id=" + id,
    });
  }
};

// Import users from CSV file
exports.importCSV = async (req, res) => {
  logger.debug("Starting CSV import for users");

  csvUpload(req, res, async function (err) {
    if (err instanceof multer.MulterError) {
      logger.error(`Multer error during CSV import: ${err.message}`);
      return res.status(400).json({ message: err.message });
    } else if (err) {
      logger.error(`Error during CSV import: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }

    if (!req.file) {
      logger.warn("No file uploaded for CSV import");
      return res.status(400).json({ message: "No file uploaded" });
    }

    try {
      // Parse CSV file
      const csvContent = req.file.buffer.toString('utf-8');
      const lines = csvContent.split('\n').filter(line => line.trim() !== '');
      
      if (lines.length < 2) {
        return res.status(400).json({ message: "CSV file must have at least a header row and one data row" });
      }

      // Parse header row
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      logger.debug(`CSV headers: ${headers.join(', ')}`);

      // Find column indices
      const idIndex = headers.findIndex(h => h === 'id');
      const fnameIndex = headers.findIndex(h => h === 'fname' || h === 'firstname');
      const lnameIndex = headers.findIndex(h => h === 'lname' || h === 'lastname');
      const emailIndex = headers.findIndex(h => h === 'email');

      if (idIndex === -1 || fnameIndex === -1 || lnameIndex === -1 || emailIndex === -1) {
        return res.status(400).json({ 
          message: "CSV must contain columns: id, fname (or firstName), lname (or lastName), email" 
        });
      }

      let addedCount = 0;
      let updatedCount = 0;
      const errors = [];

      // Process each data row
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        try {
          // Parse CSV line (handle quoted values)
          const values = [];
          let currentValue = '';
          let inQuotes = false;
          
          for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              values.push(currentValue.trim());
              currentValue = '';
            } else {
              currentValue += char;
            }
          }
          values.push(currentValue.trim()); // Add last value

          const id = values[idIndex] ? parseInt(values[idIndex].trim()) : null;
          const fName = values[fnameIndex] ? values[fnameIndex].trim() : '';
          const lName = values[lnameIndex] ? values[lnameIndex].trim() : '';
          const email = values[emailIndex] ? values[emailIndex].trim() : '';

          if (!fName || !lName || !email) {
            errors.push(`Row ${i + 1}: Missing required fields (fName, lName, or email)`);
            continue;
          }

          if (id && !isNaN(id)) {
            // Check if user exists
            const existingUser = await User.findByPk(id);
            
            if (existingUser) {
              // Update existing user
              await User.update(
                { fName, lName, email },
                { where: { id } }
              );
              updatedCount++;
              logger.debug(`Updated user ${id}: ${fName} ${lName} (${email})`);
            } else {
              // Create new user with specified ID (if database allows)
              try {
                await User.create({ id, fName, lName, email });
                addedCount++;
                logger.debug(`Added user ${id}: ${fName} ${lName} (${email})`);
              } catch (createErr) {
                // If ID insertion fails, create without ID (auto-increment)
                if (createErr.name === 'SequelizeDatabaseError' || createErr.message.includes('id')) {
                  await User.create({ fName, lName, email });
                  addedCount++;
                  logger.debug(`Added user (auto-id): ${fName} ${lName} (${email})`);
                } else {
                  throw createErr;
                }
              }
            }
          } else {
            // No ID provided, create new user
            await User.create({ fName, lName, email });
            addedCount++;
            logger.debug(`Added user (auto-id): ${fName} ${lName} (${email})`);
          }
        } catch (rowErr) {
          logger.error(`Error processing row ${i + 1}: ${rowErr.message}`);
          errors.push(`Row ${i + 1}: ${rowErr.message}`);
        }
      }

      logger.info(`CSV import completed: ${addedCount} added, ${updatedCount} updated, ${errors.length} errors`);
      
      res.status(200).json({
        message: "CSV import completed",
        added: addedCount,
        updated: updatedCount,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error) {
      logger.error(`Error processing CSV import: ${error.message}`);
      res.status(500).json({
        message: error.message || "Error processing CSV file",
      });
    }
  });
};

export default exports;

