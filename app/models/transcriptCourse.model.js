import Sequelize from "sequelize";
import SequelizeInstance from "../config/sequelizeInstance.js";

const TranscriptCourse = SequelizeInstance.define("transcript", {
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  universityTranscriptId: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
  courseNumber: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  courseDescription: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  courseHours: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
  universityCourseId: {
    type: Sequelize.INTEGER,
    allowNull: true,
  },
  courseId: {
    type: Sequelize.INTEGER,
    allowNull: true,
  },
  semesterId: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
  grade: {
    type: Sequelize.STRING,
    allowNull: true,
  },
  status: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  statusChangedDate: {
    type: Sequelize.DATE,
    allowNull: true,
  },
}, {
  timestamps: true,
  tableName: "transcript_courses",
});

export default TranscriptCourse;

