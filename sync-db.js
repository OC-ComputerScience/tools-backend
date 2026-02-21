import db from "./app/models/index.js";

async function syncDatabase() {
  try {
    // Sync all models
    await db.sequelize.sync({ force: false, alter: true });
    console.log('Database synced successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error syncing database:', error);
    process.exit(1);
  }
}

syncDatabase();
