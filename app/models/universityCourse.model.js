const { Sequelize } = require('sequelize');

module.exports = (sequelize, Sequelize) => {
  const UniversityCourse = sequelize.define("universityCourse", {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    universityId: {
      type: Sequelize.INTEGER,
      allowNull: false
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
    },
    OCCourseId: {
      type: Sequelize.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'UniversityCourse',
    tableName: 'university_courses',
    timestamps: true
  });

  return UniversityCourse;
};