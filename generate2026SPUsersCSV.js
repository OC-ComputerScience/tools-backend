import fs from 'fs';
import db from './app/models/index.js';
import { Op } from 'sequelize';

const SEMESTER_NAME = '2026SP';
const OUTPUT_PATH = './users-2026SP-non-2-sections.csv';

async function generateUsersCSV() {
  try {
    await db.sequelize.authenticate();
    console.log('Database connection established');

    // Find the 2026SP semester (try exact match or Spring 2026)
    const semester = await db.Semester.findOne({
      where: {
        [Op.or]: [
          { name: SEMESTER_NAME },
          { name: 'Spring 2026' },
        ],
      },
    });

    if (!semester) {
      console.error(`Semester "${SEMESTER_NAME}" or "Spring 2026" not found`);
      process.exit(1);
    }

    console.log(`Found semester: ${semester.name} (id: ${semester.id})`);

    // Single query: get distinct users enrolled in 2026SP sections where:
    // - courseSection does NOT start with 1, 2, or 3
    // - courseNumber does NOT start with SPWR
    // Excludes users who are enrolled in ANY section that violates these rules
    const uniqueUsers = await db.sequelize.query(
      `SELECT DISTINCT u.id, u.fName, u.lName, u.email
       FROM users u
       INNER JOIN user_sections us ON us.userId = u.id
       INNER JOIN sections s ON s.id = us.sectionId AND s.semesterId = :semesterId
       WHERE (s.courseSection IS NULL OR (s.courseSection NOT LIKE '1%' AND s.courseSection NOT LIKE '2%' AND s.courseSection NOT LIKE '3%'))
         AND (s.courseNumber IS NULL OR s.courseNumber NOT LIKE 'SPWR%')
         AND u.id NOT IN (
           SELECT us2.userId
           FROM user_sections us2
           INNER JOIN sections s2 ON s2.id = us2.sectionId AND s2.semesterId = :semesterId
           WHERE s2.courseSection LIKE '1%' OR s2.courseSection LIKE '2%' OR s2.courseSection LIKE '3%'
              OR s2.courseNumber LIKE 'SPWR%'
         )
       ORDER BY u.lName, u.fName`,
      {
        replacements: { semesterId: semester.id },
        type: db.sequelize.QueryTypes.SELECT,
      }
    );

    console.log(`Found ${uniqueUsers.length} unique users`);

    // Escape CSV values (handle commas and quotes)
    const escapeCsv = (val) => {
      const s = String(val ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const csvHeader = 'id,fName,lName,email\n';
    const csvRows = uniqueUsers.map(
      (u) => `${escapeCsv(u.id)},${escapeCsv(u.fName)},${escapeCsv(u.lName)},${escapeCsv(u.email)}`
    );
    const csvContent = csvHeader + csvRows.join('\n');

    fs.writeFileSync(OUTPUT_PATH, csvContent, 'utf-8');

    console.log(`\nGenerated CSV with ${uniqueUsers.length} unique users`);
    console.log(`Output file: ${OUTPUT_PATH}`);

    await db.sequelize.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

generateUsersCSV();
