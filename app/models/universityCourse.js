module.exports = (sequelize, DataTypes) => {
  const UniversityCourse = sequelize.define("universityCourse", {
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    code: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    credits: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    effectiveDate: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'The date when the course becomes effective'
    }
  });

  UniversityCourse.associate = function(models) {
    UniversityCourse.belongsTo(models.university, {
      foreignKey: "universityId",
      as: "university",
    });
    UniversityCourse.hasMany(models.transcriptCourse, {
      foreignKey: "universityCourseId",
      as: "transcriptCourses",
    });
  };

  return UniversityCourse;
}; 