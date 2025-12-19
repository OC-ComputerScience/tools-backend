import Sequelize from "sequelize";
import SequelizeInstance from "../config/sequelizeInstance.js";

const Term = SequelizeInstance.define("term", {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  termName: {
    type: Sequelize.STRING,
    allowNull: false,
  },
});

export default Term;

