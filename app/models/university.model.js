const { Sequelize } = require('sequelize');

module.exports = (sequelize, Sequelize) => {
  const University = sequelize.define("university", {
    id: {
      type: Sequelize.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: Sequelize.STRING,
      allowNull: false
    },
    city: {
      type: Sequelize.STRING,
      allowNull: false
    },
    state: {
      type: Sequelize.STRING,
      allowNull: false
    },
    country: {
      type: Sequelize.STRING,
      allowNull: false
    },
    oc_university_id: {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: 'ID of the university in the OC system'
    }
  }, {
    sequelize,
    modelName: 'University',
    tableName: 'universities',
    timestamps: true
  });

  return University;
};