import fs from 'fs';
import db from './app/models/index.js';

// Read section IDs from CSV file
const inputCsvPath = '/Users/david.north/Downloads/semesters-out.csv';
const sectionIds = [];

try {
  const csvContent = fs.readFileSync(inputCsvPath, 'utf-8');
  const lines = csvContent.split('\n').filter(line => line.trim() !== '');
  
  // Skip header row (first line)
  for (let i = 1; i < lines.length; i++) {
    const id = parseInt(lines[i].trim());
    if (!isNaN(id)) {
      sectionIds.push(id);
    }
  }
  
  console.log(`Read ${sectionIds.length} section IDs from CSV`);
} catch (error) {
  console.error(`Error reading CSV file: ${error.message}`);
  process.exit(1);
}

// Generate meeting times CSV
async function generateMeetingTimesCSV() {
  try {
    // Connect to database
    await db.sequelize.authenticate();
    console.log('Database connection established');

    const meetingTimesRows = [];
    let foundCount = 0;
    let notFoundCount = 0;
    
    // For each section ID, look up the section and get its sectionCode
    for (const sectionId of sectionIds) {
      try {
        const section = await db.section.findByPk(sectionId, {
          attributes: ['id', 'sectionCode']
        });
        
        if (!section) {
          console.log(`Section not found for ID: ${sectionId}`);
          notFoundCount++;
          continue;
        }
        
        if (!section.sectionCode) {
          console.log(`Section ${sectionId} has no sectionCode, skipping`);
          notFoundCount++;
          continue;
        }
        
        foundCount++;
        
        // Randomly select MWF or TT
        const isMWF = Math.random() < 0.5;
        
        let monday = 0, tuesday = 0, wednesday = 0, thursday = 0, friday = 0, saturday = 0, sunday = 0;
        let startTime, endTime;
        
        if (isMWF) {
          // MWF pattern
          monday = 1;
          wednesday = 1;
          friday = 1;
          
          // Start time: random from 8:00 to 15:00 on the hour
          const hour = Math.floor(Math.random() * 8) + 8; // 8 to 15
          startTime = `${hour.toString().padStart(2, '0')}:00:00`;
          
          // End time: start time + :50
          const endHour = hour;
          endTime = `${endHour.toString().padStart(2, '0')}:50:00`;
        } else {
          // TT pattern (Tuesday, Thursday)
          tuesday = 1;
          thursday = 1;
          
          // Start time: random from [8:00, 9:30, 11:40, 1:10]
          const ttTimes = [
            { hour: 8, minute: 0 },
            { hour: 9, minute: 30 },
            { hour: 11, minute: 40 },
            { hour: 13, minute: 10 } // 1:10 PM = 13:10
          ];
          const selectedTime = ttTimes[Math.floor(Math.random() * ttTimes.length)];
          startTime = `${selectedTime.hour.toString().padStart(2, '0')}:${selectedTime.minute.toString().padStart(2, '0')}:00`;
          
          // End time: start time + 1:15 (75 minutes)
          let endHour = selectedTime.hour;
          let endMinute = selectedTime.minute + 75; // 1 hour and 15 minutes = 75 minutes
          
          if (endMinute >= 60) {
            endHour += Math.floor(endMinute / 60);
            endMinute = endMinute % 60;
          }
          
          endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}:00`;
        }
        
        meetingTimesRows.push({
          section_code: section.sectionCode,
          monday,
          tuesday,
          wednesday,
          thursday,
          friday,
          saturday,
          sunday,
          start_time: startTime,
          end_time: endTime
        });
      } catch (err) {
        console.error(`Error processing section ID ${sectionId}: ${err.message}`);
        notFoundCount++;
      }
    }
    
    // Generate CSV content
    const csvHeader = 'section_code,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_time,end_time\n';
    const csvRows = meetingTimesRows.map(row => 
      `${row.section_code},${row.monday},${row.tuesday},${row.wednesday},${row.thursday},${row.friday},${row.saturday},${row.sunday},${row.start_time},${row.end_time}`
    );
    const csvContent = csvHeader + csvRows.join('\n');
    
    // Write CSV file
    const outputPath = '/Users/david.north/Downloads/meeting-times-import.csv';
    fs.writeFileSync(outputPath, csvContent, 'utf-8');
    
    console.log(`\nGenerated meeting times CSV with ${meetingTimesRows.length} records`);
    console.log(`Found: ${foundCount}, Not found: ${notFoundCount}`);
    console.log(`Output file: ${outputPath}`);
    
    // Close database connection
    await db.sequelize.close();
    
  } catch (error) {
    console.error('Error generating meeting times CSV:', error);
    process.exit(1);
  }
}

// Run the script
generateMeetingTimesCSV();
