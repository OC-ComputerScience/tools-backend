import Sequelize from "sequelize";
import SequelizeInstance from "../config/sequelizeInstance.js";

const MeetingTime = SequelizeInstance.define("meetingTime", {
  id: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  sectionId: {
    type: Sequelize.INTEGER,
    allowNull: false,
  },
  monday: {
    type: Sequelize.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  },
  tuesday: {
    type: Sequelize.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  },
  wednesday: {
    type: Sequelize.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  },
  thursday: {
    type: Sequelize.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  },
  friday: {
    type: Sequelize.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  },
  saturday: {
    type: Sequelize.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  },
  sunday: {
    type: Sequelize.BOOLEAN,
    defaultValue: false,
    allowNull: false,
  },
  startTime: {
    type: Sequelize.TIME,
    allowNull: false,
  },
  endTime: {
    type: Sequelize.TIME,
    allowNull: false,
  },
  sectionCode: {
    type: Sequelize.STRING(255),
    allowNull: true,
  },
});

export default MeetingTime;

