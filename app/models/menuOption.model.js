import Sequelize from "sequelize";
import SequelizeInstance from "../config/sequelizeInstance.js";

const MenuOption = SequelizeInstance.define("menuOption", {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  option: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  routeName: {
    type: Sequelize.STRING,
    allowNull: false,
  },
});

export default MenuOption;

