const { Sequelize } = require('sequelize');

module.exports = (sequelize, Sequelize) => {
const UniversityTranscript = sequelize.define("universityTranscript", {
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  OCIdNumber: {
    type: Sequelize.STRING,
    allowNull: false
  },
  name: {
    type: Sequelize.STRING,
    allowNull: false
  },
  universityId: {
    type: Sequelize.INTEGER,
    allowNull: false
  },
  official: {
    type: Sequelize.BOOLEAN,
    allowNull: false,
    defaultValue: false
  }
}, {
  sequelize,
  modelName: 'UniversityTranscript',
  tableName: 'university_transcripts',
  timestamps: true
});

return UniversityTranscript; 
}