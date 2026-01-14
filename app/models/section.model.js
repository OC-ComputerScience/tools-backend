import Sequelize from "sequelize";
import SequelizeInstance from "../config/sequelizeInstance.js";

const Section = SequelizeInstance.define("section", {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  semesterId: {
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
  accountId: {
    type: Sequelize.STRING,
    allowNull: true,
  },
  sectionCode: {
    type: Sequelize.STRING(255),
    allowNull: true,
  },
});

export default Section;
