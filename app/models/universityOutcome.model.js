import Sequelize from "sequelize";
import SequelizeInstance from "../config/sequelizeInstance.js";

const UniversityOutcome = SequelizeInstance.define("universityOutcome", {
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  universityId: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
  number: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  name: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  description: {
    type: Sequelize.TEXT,
    allowNull: true,
  },
  level: {
    type: Sequelize.ENUM("undergraduate", "graduate"),
    allowNull: false,
    defaultValue: "undergraduate",
  },
  effectiveDate: {
    type: Sequelize.DATEONLY,
    allowNull: true,
  },
  endDate: {
    type: Sequelize.DATEONLY,
    allowNull: true,
  },
}, {
  timestamps: true,
  tableName: "university_outcomes",
});

export default UniversityOutcome;
