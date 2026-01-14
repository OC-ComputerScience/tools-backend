import Sequelize from "sequelize";
import SequelizeInstance from "../config/sequelizeInstance.js";

const RoleMenuOption = SequelizeInstance.define("roleMenuOption", {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  roleId: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
  menuOptionId: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
});

export default RoleMenuOption;




