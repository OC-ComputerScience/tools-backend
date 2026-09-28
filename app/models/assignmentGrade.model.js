import Sequelize from "sequelize";
import SequelizeInstance from "../config/sequelizeInstance.js";

const AssignmentGrade = SequelizeInstance.define("assignmentGrade", {
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  sectionId: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
  assignmentId: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
  points: {
    type: Sequelize.DECIMAL(8, 2),
    allowNull: false,
  },
  studentId: {
    type: Sequelize.STRING,
    allowNull: false,
  },
}, {
  timestamps: true,
  tableName: "assignment_grades",
});

export default AssignmentGrade;
