import Sequelize, { Model } from "sequelize";
import SequelizeInstance from "../config/sequelizeInstance.js";

class Catalog extends Model {
  static associate(models) {
    // Define associations here
    Catalog.belongsTo(models.Semester, {
      foreignKey: "startSemesterId",
      as: "startSemester",
    });
    Catalog.belongsTo(models.Semester, {
      foreignKey: "endSemesterId",
      as: "endSemester",
    });
  }
}

Catalog.init(
  {
    name: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    startSemesterId: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: "semesters",
        key: "id",
      },
    },
    endSemesterId: {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: {
        model: "semesters",
        key: "id",
      },
    },
  },
  {
    sequelize: SequelizeInstance,
    modelName: "Catalog",
    tableName: "catalogs",
  }
);

export default Catalog;




