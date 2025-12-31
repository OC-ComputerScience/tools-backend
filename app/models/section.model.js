import Sequelize from "sequelize";
import SequelizeInstance from "../config/sequelizeInstance.js";

const Section = SequelizeInstance.define("section", {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  termId: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
  courseNumber: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  courseSection: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  courseDescription: {
    type: Sequelize.STRING,
    allowNull: true,
  },
  userId: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
});

export default Section;
