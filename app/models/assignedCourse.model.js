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
    allowNull: false,
  },
});

export default AssignedCourse;

