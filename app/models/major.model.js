import Sequelize from "sequelize";
import SequelizeInstance from "../config/sequelizeInstance.js";

const Major = SequelizeInstance.define("major", {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  code: {
    type: Sequelize.STRING,
    allowNull: false,
    unique: true,
  },
  description: {
    type: Sequelize.STRING,
    allowNull: false,
  },
});

export default Major;

