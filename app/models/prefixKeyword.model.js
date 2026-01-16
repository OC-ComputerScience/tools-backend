import Sequelize from "sequelize";
import SequelizeInstance from "../config/sequelizeInstance.js";

const PrefixKeyword = SequelizeInstance.define("prefixKeyword", {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  prefix: {
    type: Sequelize.STRING,
    allowNull: false,
    unique: true,
  },
  keywords: {
    type: Sequelize.STRING(1000),
    allowNull: false,
  },
}, {
  timestamps: true,
  tableName: "prefix_keywords",
});

export default PrefixKeyword;
