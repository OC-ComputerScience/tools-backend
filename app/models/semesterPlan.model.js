import Sequelize from "sequelize";
import SequelizeInstance from "../config/sequelizeInstance.js";

const SemesterPlan = SequelizeInstance.define("semesterPlan", {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  majorId: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
  semesterNumber: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
  courseId: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
});

export default SemesterPlan;

