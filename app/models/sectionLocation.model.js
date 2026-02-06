import Sequelize from "sequelize";
import SequelizeInstance from "../config/sequelizeInstance.js";

const SectionLocation = SequelizeInstance.define("sectionLocation", {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  sectionId: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
  locationName: {
    type: Sequelize.STRING,
    allowNull: false,
  },
});

export default SectionLocation;
