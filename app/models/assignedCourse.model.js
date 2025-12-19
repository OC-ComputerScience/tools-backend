import Sequelize from "sequelize";
import SequelizeInstance from "../config/sequelizeInstance.js";

const AssignedCourse = SequelizeInstance.define("assignedCourse", {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  courseId: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
  assignedCourseId: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
});

export default AssignedCourse;

