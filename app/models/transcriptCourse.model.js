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
    allowNull: true,
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
  permanentAssignment: {
    type: Sequelize.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
}, {
  timestamps: true,
  tableName: "transcript_courses",
});

export default TranscriptCourse;

