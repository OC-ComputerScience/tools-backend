import Sequelize from "sequelize";
import SequelizeInstance from "../config/sequelizeInstance.js";

const UserRole = SequelizeInstance.define("userRole", {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  userId: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
  roleId: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
});

export default UserRole;




