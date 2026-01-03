'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Catalog extends Model {
    static associate(models) {
      // Define associations here
      Catalog.belongsTo(models.Semester, {
        foreignKey: 'startSemesterId',
        as: 'startSemester'
      });
      Catalog.belongsTo(models.Semester, {
        foreignKey: 'endSemesterId',
        as: 'endSemester'
      });
    }
  }
  
  Catalog.init({
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    startSemesterId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'semesters',
        key: 'id'
      }
    },
    endSemesterId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'semesters',
        key: 'id'
      }
    }
  }, {
    sequelize,
    modelName: 'Catalog',
    tableName: 'catalogs'
  });
  
  return Catalog;
}; 