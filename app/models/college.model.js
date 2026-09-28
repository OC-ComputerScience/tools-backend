import Sequelize from "sequelize";
import SequelizeInstance from "../config/sequelizeInstance.js";

const College = SequelizeInstance.define("college", {
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  universityId: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
  name: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  deanUserId: {
    type: Sequelize.INTEGER,
    allowNull: true,
  },
  assessmentWeight: {
    type: Sequelize.INTEGER,
    allowNull: true,
  },
}, {
  timestamps: true,
  tableName: "colleges",
});

export default College;
