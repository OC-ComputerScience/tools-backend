import Sequelize from "sequelize";
import SequelizeInstance from "../config/sequelizeInstance.js";

const DepartmentOutcome = SequelizeInstance.define("departmentOutcome", {
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  departmentId: {
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
  tableName: "department_outcomes",
});

export default DepartmentOutcome;
