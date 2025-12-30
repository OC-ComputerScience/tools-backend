import dbConfig from "../config/db.config.js";
import { Sequelize } from "sequelize";
import sequelize from "../config/sequelizeInstance.js";

// Models
import User from "./user.model.js";
import Session from "./session.model.js";
import Term from "./term.model.js";
import Section from "./section.model.js";
import AssignedCourse from "./assignedCourse.model.js";
import MeetingTime from "./meetingTime.model.js";
import Major from "./major.model.js";

const db = {};
db.Sequelize = Sequelize;
db.sequelize = sequelize;

db.user = User;
db.session = Session;
db.term = Term;
db.section = Section;
db.assignedCourse = AssignedCourse;
db.meetingTime = MeetingTime;
db.major = Major;

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

// Foreign key for sections
db.user.hasMany(
  db.section,
  { as: "section" },
  { foreignKey: { allowNull: false }, onDelete: "CASCADE" }
);
db.section.belongsTo(
  db.user,
  { as: "user" },
  { foreignKey: { allowNull: false }, onDelete: "CASCADE" }
);

// Foreign key for terms
db.term.hasMany(
  db.section,
  { as: "section" },
  { foreignKey: { allowNull: false }, onDelete: "CASCADE" }
);
db.section.belongsTo(
  db.term,
  { as: "term" },
  { foreignKey: { allowNull: false }, onDelete: "CASCADE" }
);

// Foreign key for assigned courses (sections)
db.section.hasMany(
  db.assignedCourse,
  { as: "assignedCourse", foreignKey: "sectionId" },
  { onDelete: "CASCADE" }
);
db.section.hasMany(
  db.assignedCourse,
  { as: "assignedToSection", foreignKey: "assignedSectionId" },
  { onDelete: "CASCADE" }
);
db.assignedCourse.belongsTo(
  db.section,
  { as: "section", foreignKey: "sectionId" }
);
db.assignedCourse.belongsTo(
  db.section,
  { as: "assignedSection", foreignKey: "assignedSectionId" }
);

// Foreign key for meeting times
db.section.hasMany(
  db.meetingTime,
  { as: "meetingTimes", foreignKey: "courseId" },
  { onDelete: "CASCADE" }
);
db.meetingTime.belongsTo(
  db.section,
  { as: "section", foreignKey: "courseId" }
);

export default db;

