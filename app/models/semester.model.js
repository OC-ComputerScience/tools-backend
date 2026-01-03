module.exports = (sequelize, Sequelize) => {
  const Semester = sequelize.define("semester", {
    name: {
      type: Sequelize.STRING,
      allowNull: false,
    },
    startDate: {
      type: Sequelize.DATE,
      allowNull: false,
    },
    endDate: {
      type: Sequelize.DATE,
      allowNull: false,
    },
  });

  return Semester;
}; 