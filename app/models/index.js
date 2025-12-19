import dbConfig from "../config/db.config.js";
import { Sequelize } from "sequelize";
import sequelize from "../config/sequelizeInstance.js";

// Models
import User from "./user.model.js";
import Session from "./session.model.js";
import Term from "./term.model.js";
import Course from "./course.model.js";
import AssignedCourse from "./assignedCourse.model.js";

const db = {};
db.Sequelize = Sequelize;
db.sequelize = sequelize;

db.user = User;
db.session = Session;
db.term = Term;
db.course = Course;
db.assignedCourse = AssignedCourse;

// Foreign key for session
db.user.hasMany(
  db.session,
  { as: "session" },
  { foreignKey: { allowNull: false }, onDelete: "CASCADE" }
);
db.session.belongsTo(
  db.user,
  { as: "user" },
  { foreignKey: { allowNull: false }, onDelete: "CASCADE" }
);

// Foreign key for courses
db.user.hasMany(
  db.course,
  { as: "course" },
  { foreignKey: { allowNull: false }, onDelete: "CASCADE" }
);
db.course.belongsTo(
  db.user,
  { as: "user" },
  { foreignKey: { allowNull: false }, onDelete: "CASCADE" }
);

// Foreign key for terms
db.term.hasMany(
  db.course,
  { as: "course" },
  { foreignKey: { allowNull: false }, onDelete: "CASCADE" }
);
db.course.belongsTo(
  db.term,
  { as: "term" },
  { foreignKey: { allowNull: false }, onDelete: "CASCADE" }
);

// Foreign key for assigned courses
db.course.hasMany(
  db.assignedCourse,
  { as: "assignedCourse", foreignKey: "courseId" },
  { onDelete: "CASCADE" }
);
db.course.hasMany(
  db.assignedCourse,
  { as: "assignedToCourse", foreignKey: "assignedCourseId" },
  { onDelete: "CASCADE" }
);
db.assignedCourse.belongsTo(
  db.course,
  { as: "course", foreignKey: "courseId" }
);
db.assignedCourse.belongsTo(
  db.course,
  { as: "assignedCourse", foreignKey: "assignedCourseId" }
);

export default db;

