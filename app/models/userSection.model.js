import Sequelize from "sequelize";
import SequelizeInstance from "../config/sequelizeInstance.js";

const UserSection = SequelizeInstance.define("userSection", {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  userId: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
  sectionId: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
  sectionCode: {
    type: Sequelize.STRING(255),
    allowNull: true,
  },
}, {
  timestamps: true,
  tableName: "user_sections",
});

export default UserSection;

