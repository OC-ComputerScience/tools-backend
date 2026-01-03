const { Sequelize } = require('sequelize');

module.exports = (sequelize, Sequelize) => {
  const TranscriptCourse = sequelize.define("transcript", {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    universityTranscriptId: {
      type: Sequelize.INTEGER,
      allowNull: false
    },
    courseNumber: {
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
    universityCourseId: {
      type: Sequelize.INTEGER,
      allowNull: true
    },
    OCCourseId: {
      type: Sequelize.INTEGER,
      allowNull: true
    },
    semesterId: {
      type: Sequelize.INTEGER,
      allowNull: false
    },
    grade: {
      type: Sequelize.STRING,
      allowNull: false
    },
    status: {
      type: Sequelize.STRING,
      allowNull: false
    },
    statusChangedDate: {
      type: Sequelize.DATE,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'TranscriptCourse',
    tableName: 'transcript_courses',
    timestamps: true
  });

  return TranscriptCourse;
};