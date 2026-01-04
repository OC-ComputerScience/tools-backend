import Sequelize from "sequelize";
import SequelizeInstance from "../config/sequelizeInstance.js";

const UniversityCourse = SequelizeInstance.define("universityCourse", {
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  universityId: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
  courseNumber: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  courseName: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  courseDescription: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  courseHours: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
  courseId: {
    type: Sequelize.INTEGER,
    allowNull: true,
  },
}, {
  timestamps: true,
  tableName: "university_courses",
});

export default UniversityCourse;

