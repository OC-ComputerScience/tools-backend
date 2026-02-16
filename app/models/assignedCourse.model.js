import Sequelize from "sequelize";
import SequelizeInstance from "../config/sequelizeInstance.js";

const AssignedCourse = SequelizeInstance.define("assignedCourse", {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  sectionId: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
  assignedSectionId: {
    type: Sequelize.INTEGER,
    allowNull: true,
  },
  notAssignmentNeeded: {
    type: Sequelize.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  exported: {
    type: Sequelize.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  exportedDate: {
    type: Sequelize.DATEONLY,
    allowNull: true,
  },
  coursesExported: {
    type: Sequelize.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  coursesExportedDate: {
    type: Sequelize.DATEONLY,
    allowNull: true,
  },
});

export default AssignedCourse;

