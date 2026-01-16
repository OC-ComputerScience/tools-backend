import db from "./app/models/index.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const Course = db.course;

// Common stop words to filter out
const stopWords = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
  'to', 'was', 'will', 'with', 'the', 'this', 'these', 'those',
  'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x',
  'introduction', 'intro', 'introductions', 'fundamentals', 'fundamental',
  'principles', 'principle', 'basics', 'basic', 'overview', 'overviews'
]);

// Function to extract keywords from description
function extractKeywords(description) {
  if (!description) return [];
  
  // Convert to lowercase and split into words
  const words = description
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ') // Remove punctuation except hyphens
    .split(/\s+/)
    .filter(word => word.length > 2) // Only words longer than 2 characters
    .filter(word => !stopWords.has(word)) // Remove stop words
    .filter(word => !/^\d+$/.test(word)) // Remove pure numbers
    .filter(word => word.length > 0);
  
  // Count word frequency
  const wordCount = {};
  words.forEach(word => {
    wordCount[word] = (wordCount[word] || 0) + 1;
  });
  
  // Get unique words, sorted by frequency (descending), then alphabetically
  const uniqueWords = Object.keys(wordCount)
    .sort((a, b) => {
      if (wordCount[b] !== wordCount[a]) {
        return wordCount[b] - wordCount[a];
      }
      return a.localeCompare(b);
    });
  
  return uniqueWords;
}

// Function to combine keywords from multiple descriptions
function combineKeywords(keywordsArrays) {
  const allKeywords = {};
  
  keywordsArrays.forEach(keywords => {
    keywords.forEach((keyword, index) => {
      // Weight keywords by their position (earlier = more important)
      const weight = keywords.length - index;
      allKeywords[keyword] = (allKeywords[keyword] || 0) + weight;
    });
  });
  
  // Sort by weight (descending), then alphabetically
  const sorted = Object.keys(allKeywords)
    .sort((a, b) => {
      if (allKeywords[b] !== allKeywords[a]) {
        return allKeywords[b] - allKeywords[a];
      }
      return a.localeCompare(b);
    });
  
  // Take top 10-15 most important keywords
  return sorted.slice(0, 15);
}

async function generateCoursePrefixesCSV() {
  try {
    console.log("Connecting to database...");
    
    // Get all courses with descriptions
    const courses = await Course.findAll({
      attributes: ["code", "number", "description"],
      raw: true,
    });

    console.log(`Found ${courses.length} courses`);

    // Group courses by prefix and collect descriptions
    const prefixMap = new Map(); // prefix -> { descriptions: [], courses: [] }

    courses.forEach((course) => {
      let fullCourseNumber = "";
      
      // Check if number field contains the full course identifier (e.g., "CMSC-1113")
      if (course.number && (course.number.includes("-") || /^[A-Za-z]/.test(course.number))) {
        // Number is like "CMSC-1113" or "CMSC1113" (contains letters)
        fullCourseNumber = course.number;
      } else if (course.code && course.number) {
        // Combine code and number: "CMSC" + "1113" = "CMSC1113"
        fullCourseNumber = `${course.code}${course.number}`;
      } else if (course.code) {
        // Just use the code (e.g., "CMSC")
        fullCourseNumber = course.code;
      } else if (course.number) {
        // Just use the number (e.g., "1113")
        fullCourseNumber = course.number;
      }

      // Extract first 4 characters, removing any dashes first
      if (fullCourseNumber) {
        // Remove dashes and spaces, then take first 4 characters
        const cleaned = fullCourseNumber.replace(/[-\s]/g, '').toUpperCase();
        if (cleaned.length >= 4) {
          const prefix = cleaned.substring(0, 4);
          
          if (!prefixMap.has(prefix)) {
            prefixMap.set(prefix, { descriptions: [], courses: [] });
          }
          
          const prefixData = prefixMap.get(prefix);
          if (course.description) {
            prefixData.descriptions.push(course.description);
          }
          prefixData.courses.push(course);
        } else if (cleaned.length > 0) {
          // If less than 4 characters, use as is
          const prefix = cleaned;
          
          if (!prefixMap.has(prefix)) {
            prefixMap.set(prefix, { descriptions: [], courses: [] });
          }
          
          const prefixData = prefixMap.get(prefix);
          if (course.description) {
            prefixData.descriptions.push(course.description);
          }
          prefixData.courses.push(course);
        }
      }
    });

    console.log(`Found ${prefixMap.size} unique course prefixes`);

    // Generate keywords for each prefix
    const prefixData = [];
    
    for (const [prefix, data] of prefixMap.entries()) {
      // Extract keywords from all descriptions for this prefix
      const keywordArrays = data.descriptions.map(desc => extractKeywords(desc));
      const keywords = combineKeywords(keywordArrays);
      
      // Create keywords string (comma-separated)
      const keywordsString = keywords.join(', ');
      
      prefixData.push({
        prefix,
        keywords: keywordsString,
        courseCount: data.courses.length
      });
    }

    // Sort prefixes alphabetically
    prefixData.sort((a, b) => a.prefix.localeCompare(b.prefix));

    // Generate CSV content
    const csvHeader = "prefix,keywords\n";
    const csvRows = prefixData.map(item => {
      // Escape keywords if they contain commas or quotes
      const escapedKeywords = item.keywords.includes(',') || item.keywords.includes('"')
        ? `"${item.keywords.replace(/"/g, '""')}"`
        : item.keywords;
      return `${item.prefix},${escapedKeywords}`;
    }).join("\n");
    const csvContent = csvHeader + csvRows;

    // Write to file
    const outputPath = path.join(__dirname, "course-prefixes.csv");
    fs.writeFileSync(outputPath, csvContent, "utf8");

    console.log(`CSV file created successfully: ${outputPath}`);
    console.log(`Total unique prefixes: ${prefixData.length}`);
    console.log(`\nSample entries:`);
    prefixData.slice(0, 5).forEach(item => {
      console.log(`  ${item.prefix}: ${item.keywords.substring(0, 60)}... (${item.courseCount} courses)`);
    });
    
    // Close database connection
    await db.sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error("Error generating CSV:", error);
    await db.sequelize.close();
    process.exit(1);
  }
}

generateCoursePrefixesCSV();
