import Sequelize from "sequelize";
import SequelizeInstance from "../config/sequelizeInstance.js";

const UniversityTranscript = SequelizeInstance.define("universityTranscript", {
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  OCIdNumber: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  name: {
    type: Sequelize.STRING,
    allowNull: false,
  },
  universityId: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
  official: {
    type: Sequelize.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  status: {
    type: Sequelize.STRING,
    allowNull: false,
    defaultValue: "Not Process",
  },
}, {
  timestamps: true,
  tableName: "university_transcripts",
});

export default UniversityTranscript;




