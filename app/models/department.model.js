import Sequelize from "sequelize";
import SequelizeInstance from "../config/sequelizeInstance.js";

const Department = SequelizeInstance.define("department", {
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  universityId: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
  collegeId: {
    type: Sequelize.INTEGER,
    allowNull: true,
  },
  code: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  name: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  chairUserId: {
    type: Sequelize.INTEGER,
    allowNull: true,
  },
  assessmentWeight: {
    type: Sequelize.INTEGER,
    allowNull: true,
  },
}, {
  timestamps: true,
  tableName: "departments",
});

export default Department;
