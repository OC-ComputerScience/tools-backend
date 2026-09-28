import Sequelize from "sequelize";
import SequelizeInstance from "../config/sequelizeInstance.js";

const Semester = SequelizeInstance.define("semester", {
  name: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  startDate: {
    type: Sequelize.DATE,
    allowNull: false,
  },
  endDate: {
    type: Sequelize.DATE,
    allowNull: false,
  },
  canvasTermId: {
    type: Sequelize.INTEGER,
    allowNull: true,
  },
});

export default Semester;




