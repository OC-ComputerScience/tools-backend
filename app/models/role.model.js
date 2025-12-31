import Sequelize from "sequelize";
import SequelizeInstance from "../config/sequelizeInstance.js";

const Role = SequelizeInstance.define("role", {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  name: {
    type: Sequelize.STRING,
    allowNull: false,
    unique: true,
  },
  description: {
    type: Sequelize.STRING,
    allowNull: false,
  },
});

export default Role;

