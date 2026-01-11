import fs from 'fs';

const data = `*** Semester 1 ***
 CMSC-1313:     Software Engr I - Introduction     3 Credits
 CMSC-1113:     Programming I                      3 Credits
 ENGL-1113:     English Comp I                     3 Credits
 COMM-1213:     Oral Communication                 3 Credits
 CMSC-1113L:    Programming I Lab                  0 Credits
 BIBL-1013:     Israel and God's Kingdom           3 Credits

*** Semester 2 ***
 CMSC-1123:     Programming II                     3 Credits
 CMSC-2011:     CS Team Experience I               1 Credits
 MATH-1623:     Intro to Discrete Math             3 Credits
 MATH-1614:     Pre-Calculus Math                  4 Credits
 CMSC-1123L:    Programming II Lab                 0 Credits
 ENGL-1213:     English Comp II                    3 Credits
 BIBL-1033:     Jesus, Church & God's Kingdom      3 Credits

*** Semester 3 ***
 CMSC-2133:     Object Oriented Programming        3 Credits
 CMSC-2413:     Assembly Lang                      3 Credits
 CMSC-2313:     Software Engr II - Practices       3 Credits
 MATH-2114:     Calc I with Analytcl Geometry      4 Credits
 CMSC-2133L:    Object Oriented Programming la     0 Credits
 BIBL-2103:     Christian Life in God's Kingdo     3 Credits

*** Semester 4 ***
 CMSC-2213:     Internet Application Developme     3 Credits
 CMSC-2233:     Data Structures and Algorithm      3 Credits
 CMSC-2011:     CS Team Experience I               1 Credits
 MATH-2214:     Calculus II                        4 Credits
#GNED-1933:     P:Humanities                       3 Credits
 CMSC-2213L:    Internet Application Dev Lab       0 Credits

*** Semester 5 ***
 CMSC-3313:     Software Engineering III - Eth     3 Credits
#GNED-1093:     P:Prof Communication               3 Credits
#CMSC-1083:     P:Computer Sci Upper Div Elec      3 Credits
#CMSC-1093:     P:Computer Sci Upper Div Elec      3 Credits
 POLS-2113:     American Politics                  3 Credits

*** Semester 6 ***
 CMSC-3443:     Computer Org & Arch                3 Credits
 CMSC-4413:     Operating Systems                  3 Credits
 CMSC-4011:     CS Team Experience II              1 Credits
#CMSC-1083.2:   P:Computer Sci Upper Div Elec      3 Credits
#CMSC-1093.2:   P:Computer Sci Upper Div Elec      3 Credits
#BIBL-9003:     P:3 Hours Bible Elective           3 Credits

*** Semester 7 ***
 MATH-2913:     Statistical Methods                3 Credits
 MATH-3513:     Linear Algebra                     3 Credits
 CMSC-4123:     Software Engr IV Tools             3 Credits
 CMSC-4323:     Database Systems                   3 Credits
 CMSC-4123L:     Software Engineering IV-Tools      0 Credits
#GNSC-1003:     P:General Science for Gen Educ     3 Credits

*** Semester 8 ***
 CMSC-4243:     Software Engineering V - Proje     3 Credits
 CMSC-4513:     Programming Languages              3 Credits
 CMSC-4011:     CS Team Experience II              1 Credits
 CMSC-4243L:    Software Engineering V - Proje     0 Credits
#BIBL-9003.2:   P:3 Hours Bible Elective           3 Credits
#GNED-1073:     P:American History Required        3 Credits
#GNED-1973:     P:Behav/Soc Science Gen Ed         3 Credits
 GRAD-4000:     Graduation This Semester           0 Credits`;

function generateMajorCoursesCSV() {
  const lines = data.split('\n');
  const courses = [];
  let currentSemester = null;
  const majorCode = 'COMPSCI.BS';
  
  for (const line of lines) {
    // Check for semester header
    const semesterMatch = line.match(/\*\*\* Semester (\d+) \*\*\*/);
    if (semesterMatch) {
      currentSemester = parseInt(semesterMatch[1]);
      continue;
    }
    
    // Skip empty lines
    if (!line.trim()) {
      continue;
    }
    
    // Extract course code (format: CMSC-1313, CMSC-1113L, or #CMSC-1083.2)
    // Pattern matches: optional #, letters, dash, numbers, optional . and more numbers, optional letter suffix, optional colon
    const courseMatch = line.match(/^[\s#]*(?:#)?([A-Z]+)-(\d+(?:\.\d+)?)([A-Z]?)/);
    if (courseMatch && currentSemester) {
      const prefix = courseMatch[1];
      const number = courseMatch[2];
      const suffix = courseMatch[3] || '';
      const courseNumber = `${prefix}-${number}${suffix}`;
      
      courses.push({
        majorCode,
        courseNumber,
        semesterNumber: currentSemester
      });
    }
  }
  
  // Generate CSV content
  const csvHeader = 'majorCode,courseNumber,semesterNumber\n';
  const csvRows = courses.map(course => 
    `${course.majorCode},${course.courseNumber},${course.semesterNumber}`
  );
  const csvContent = csvHeader + csvRows.join('\n');
  
  // Write CSV file
  const outputPath = '/Users/david.north/Downloads/major-courses.csv';
  fs.writeFileSync(outputPath, csvContent, 'utf-8');
  
  console.log(`Generated CSV with ${courses.length} courses`);
  console.log(`Output file: ${outputPath}`);
  console.log(`\nSample records:`);
  courses.slice(0, 5).forEach(c => {
    console.log(`  ${c.majorCode}, ${c.courseNumber}, ${c.semesterNumber}`);
  });
}

generateMajorCoursesCSV();
