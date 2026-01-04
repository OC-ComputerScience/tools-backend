import Sequelize from "sequelize";
import SequelizeInstance from "../config/sequelizeInstance.js";

const Course = SequelizeInstance.define("course", {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  code: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  number: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  description: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  hours: {
    type: Sequelize.INTEGER,
    allowNull: true,
  },
});

export default Course;
