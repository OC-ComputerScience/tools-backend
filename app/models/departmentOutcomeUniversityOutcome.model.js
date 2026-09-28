import Sequelize from "sequelize";
import SequelizeInstance from "../config/sequelizeInstance.js";

const DepartmentOutcomeUniversityOutcome = SequelizeInstance.define(
  "departmentOutcomeUniversityOutcome",
  {
    id: {
      type: Sequelize.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    departmentOutcomeId: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
    universityOutcomeId: {
      type: Sequelize.INTEGER,
      allowNull: false,
    },
  },
  {
    timestamps: true,
    tableName: "department_outcome_university_outcomes",
    indexes: [
      {
        unique: true,
        name: "dept_outcome_univ_outcome_unique",
        fields: ["departmentOutcomeId", "universityOutcomeId"],
      },
    ],
  }
);

export default DepartmentOutcomeUniversityOutcome;
