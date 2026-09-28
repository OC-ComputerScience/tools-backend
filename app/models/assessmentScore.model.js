import Sequelize from "sequelize";
import SequelizeInstance from "../config/sequelizeInstance.js";

const AssessmentScore = SequelizeInstance.define("assessmentScore", {
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  score: {
    type: Sequelize.DECIMAL(8, 2),
    allowNull: false,
  },
  percentage: {
    type: Sequelize.DECIMAL(8, 2),
    allowNull: false,
  },
  description: {
    type: Sequelize.STRING,
    allowNull: true,
  },
}, {
  timestamps: true,
  tableName: "assessment_scores",
});

export default AssessmentScore;
