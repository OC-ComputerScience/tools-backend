const { Sequelize } = require('sequelize');

module.exports = (sequelize, Sequelize) => {

const OCCourse = sequelize.define("ocCourse", {
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  courseNumber: {
    type: Sequelize.STRING,
    allowNull: false
  },
  courseName: {
    type: Sequelize.STRING,
    allowNull: false
  },
  courseDescription: {
    type: Sequelize.STRING,
    allowNull: false
  },
  courseHours: {
    type: Sequelize.INTEGER,
    allowNull: false
  }
}, {
  sequelize,
  modelName: 'OCCourse',
  tableName: 'oc_courses',
  timestamps: true
});

return OCCourse; 
}