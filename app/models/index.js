import dbConfig from "../config/db.config.js";
import { Sequelize } from "sequelize";
import sequelize from "../config/sequelizeInstance.js";

// Models
import User from "./user.model.js";
import Session from "./session.model.js";
import Term from "./term.model.js";
import Course from "./course.model.js";
import Section from "./section.model.js";
import AssignedCourse from "./assignedCourse.model.js";
import MeetingTime from "./meetingTime.model.js";
import Major from "./major.model.js";
import SemesterPlan from "./semesterPlan.model.js";
import Role from "./role.model.js";
import UserRole from "./userRole.model.js";
import MenuOption from "./menuOption.model.js";
import RoleMenuOption from "./roleMenuOption.model.js";

const db = {};
db.Sequelize = Sequelize;
db.sequelize = sequelize;

db.user = User;
db.session = Session;
db.term = Term;
db.course = Course;
db.section = Section;
db.assignedCourse = AssignedCourse;
db.meetingTime = MeetingTime;
db.major = Major;
db.semesterPlan = SemesterPlan;
db.role = Role;
db.userRole = UserRole;
db.menuOption = MenuOption;
db.roleMenuOption = RoleMenuOption;

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

// Note: Course model is a master catalog table (code, number, description)
// It does not have relationships with users, terms, assignedCourses, or meetingTimes
// Those relationships are handled by the Section model

// Foreign key relationships for Section
db.user.hasMany(db.section, { as: "sections", foreignKey: "userId", onDelete: "CASCADE" });
db.section.belongsTo(db.user, { as: "user", foreignKey: "userId" });

db.term.hasMany(db.section, { as: "sections", foreignKey: "termId", onDelete: "CASCADE" });
db.section.belongsTo(db.term, { as: "term", foreignKey: "termId" });

// Section relationships with AssignedCourse
db.section.hasMany(db.assignedCourse, { as: "assignedSections", foreignKey: "sectionId", onDelete: "CASCADE" });
db.section.hasMany(db.assignedCourse, { as: "assignedToSections", foreignKey: "assignedSectionId", onDelete: "CASCADE" });
db.assignedCourse.belongsTo(db.section, { as: "section", foreignKey: "sectionId" });
db.assignedCourse.belongsTo(db.section, { as: "assignedSection", foreignKey: "assignedSectionId" });

// Section relationships with MeetingTime
db.section.hasMany(db.meetingTime, { as: "meetingTimes", foreignKey: "sectionId", onDelete: "CASCADE" });
db.meetingTime.belongsTo(db.section, { as: "section", foreignKey: "sectionId" });

// Foreign key relationships for SemesterPlan
db.major.hasMany(
  db.semesterPlan,
  { as: "semesterPlans", foreignKey: "majorId" },
  { onDelete: "CASCADE" }
);
db.semesterPlan.belongsTo(
  db.major,
  { as: "major", foreignKey: "majorId" }
);

db.course.hasMany(
  db.semesterPlan,
  { as: "semesterPlans", foreignKey: "courseId" },
  { onDelete: "CASCADE" }
);
db.semesterPlan.belongsTo(
  db.course,
  { as: "course", foreignKey: "courseId" }
);

// Many-to-many relationship between User and Role
db.user.belongsToMany(db.role, {
  through: db.userRole,
  as: "roles",
  foreignKey: "userId",
  otherKey: "roleId",
  onDelete: "CASCADE",
});
db.role.belongsToMany(db.user, {
  through: db.userRole,
  as: "users",
  foreignKey: "roleId",
  otherKey: "userId",
  onDelete: "CASCADE",
});

// Many-to-many relationship between Role and MenuOption
db.role.belongsToMany(db.menuOption, {
  through: db.roleMenuOption,
  as: "menuOptions",
  foreignKey: "roleId",
  otherKey: "menuOptionId",
  onDelete: "CASCADE",
});
db.menuOption.belongsToMany(db.role, {
  through: db.roleMenuOption,
  as: "roles",
  foreignKey: "menuOptionId",
  otherKey: "roleId",
  onDelete: "CASCADE",
});

export default db;

