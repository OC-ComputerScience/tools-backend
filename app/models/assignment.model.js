import Sequelize from "sequelize";
import SequelizeInstance from "../config/sequelizeInstance.js";

const Assignment = SequelizeInstance.define("assignment", {
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  departmentId: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
  courseId: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
  name: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  totalPoints: {
    type: Sequelize.DECIMAL(8, 2),
    allowNull: true,
  },
  description: {
    type: Sequelize.TEXT,
    allowNull: true,
  },
  departmentOutcomeId: {
    type: Sequelize.INTEGER,
    allowNull: true,
  },
  coreAssessment: {
    type: Sequelize.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  universityOutcomeId: {
    type: Sequelize.INTEGER,
    allowNull: true,
  },
}, {
  timestamps: true,
  tableName: "assignments",
});

export default Assignment;
