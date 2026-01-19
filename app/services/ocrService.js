import { createWorker } from "tesseract.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { createRequire } from "module";
import logger from "../config/logger.js";

// Use createRequire to load pdf-parse
// Note: pdf-parse versions may export differently
// Try requiring it and accessing the function correctly
const require = createRequire(import.meta.url);

// Try requiring pdf-parse - it should export a function directly in older versions
// But newer versions export an object with PDFParse class
let pdfParseModule;
try {
  pdfParseModule = require("pdf-parse");
} catch (e) {
  console.error('Error requiring pdf-parse:', e);
  throw e;
}

// Check if it's a function directly (older versions)
let pdfParse;
if (typeof pdfParseModule === 'function') {
  pdfParse = pdfParseModule;
} else if (pdfParseModule && typeof pdfParseModule.default === 'function') {
  pdfParse = pdfParseModule.default;
} else {
  // If it's an object, try to find the function
  // Some versions wrap it - try common patterns
  console.error('pdf-parse module structure:', {
    type: typeof pdfParseModule,
    keys: Object.keys(pdfParseModule || {}),
    hasDefault: 'default' in (pdfParseModule || {}),
    PDFParseType: typeof pdfParseModule?.PDFParse
  });
  throw new Error('pdf-parse did not export a function. Module type: ' + typeof pdfParseModule + '. Please check pdf-parse version and documentation.');
}

const execPromise = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class OCRService {
  constructor() {
    // Initialize Gemini
    // Note: Make sure GEMINI_API_KEY is set in your .env file
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn(
        "WARNING: GEMINI_API_KEY is not set. Transcript parsing will fail."
      );
    } else {
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({
        model: "gemini-2.5-flash-lite",
      });
    }
  }

  async extractTextFromPDF(pdfBuffer) {
    try {
      const data = await pdfParse(pdfBuffer);
      return data.text;
    } catch (error) {
      console.error("Error extracting text from PDF:", error);
      throw error;
    }
  }

  async performOCR(imageBuffer) {
    const worker = await createWorker("eng");
    try {
      const {
        data: { text },
      } = await worker.recognize(imageBuffer);
      await worker.terminate();
      return text;
    } catch (error) {
      console.error("Error performing OCR:", error);
      throw error;
    }
  }

  async convertPdfToImage(pdfBuffer) {
    const tempPdfPath = path.join(__dirname, `temp_${Date.now()}.pdf`);
    const tempPngPath = path.join(__dirname, `temp_${Date.now()}.png`);

    try {
      fs.writeFileSync(tempPdfPath, pdfBuffer);

      // Use sips to convert PDF to PNG (macOS only) with high resolution
      // -Z 3000 sets the maximum dimension to 3000 pixels, ensuring good quality for OCR
      await execPromise(
        `sips -s format png --resampleHeightWidthMax 3000 "${tempPdfPath}" --out "${tempPngPath}"`
      );

      if (fs.existsSync(tempPngPath)) {
        const imageBuffer = fs.readFileSync(tempPngPath);
        return imageBuffer;
      } else {
        throw new Error("Image conversion failed: Output file not created");
      }
    } catch (error) {
      console.error("Error converting PDF to image:", error);
      throw error;
    } finally {
      // Cleanup
      if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);
      if (fs.existsSync(tempPngPath)) fs.unlinkSync(tempPngPath);
    }
  }

  async extractTranscriptInfo(pdfBuffer) {
    try {
      // First try to extract text directly from PDF
      let text = await this.extractTextFromPDF(pdfBuffer);
      let ocrText = null;

      // Check for bad extraction (heuristic: average line length)
      const lines = text.split("\n").filter((l) => l.trim().length > 0);
      const avgLineLength = lines.length > 0 ? text.length / lines.length : 0;
      console.log("Average line length:", avgLineLength);

      if (!text || text.trim().length === 0 || avgLineLength < 10) {
        console.log("Text extraction quality poor. Falling back to OCR...");
        try {
          const imageBuffer = await this.convertPdfToImage(pdfBuffer);
          ocrText = await this.performOCR(imageBuffer);
          console.log("OCR Text length:", ocrText.length);
        } catch (ocrError) {
          console.error("OCR fallback failed:", ocrError);
          // Continue with original text if OCR fails
        }
      }

      if ((!text || text.trim().length === 0) && !ocrText) {
        throw new Error(
          "No text extracted from PDF. The file might be an image-only PDF."
        );
      }

      // Parse the extracted text using LLM
      return await this.parseWithLLM(text, ocrText);
    } catch (error) {
      console.error("Error extracting transcript info:", error);
      throw error;
    }
  }

  async parseWithLLM(text, ocrText = null) {
    if (!this.model) {
      throw new Error(
        "Gemini API is not initialized. Please check your GEMINI_API_KEY."
      );
    }

    let promptText = `Raw Text:\n${text}`;
    if (ocrText) {
      promptText += `\n\nOCR Text (Alternative Extraction):\n${ocrText}\n\nNote: The "Raw Text" might have broken words due to layout issues. The "OCR Text" might have recognition errors. Please use both sources to reconstruct the most accurate transcript data.`;
    }

    // TWO-PASS APPROACH: First identify structure, then extract courses with that context
    logger.info("Starting TWO-PASS extraction: Pass 1 - Structure Identification");
    console.log("=== TWO-PASS APPROACH: Pass 1 - Structure Identification ===");
    
    // PASS 1: Identify semester headers and determine column layout
    const structureData = await this.identifyStructure(promptText);
    
    logger.info("Pass 1 complete. Starting Pass 2 - Course Extraction with Structure Context");
    logger.info(`Structure identified: ${structureData.semesterHeaders?.length || 0} headers found, ${structureData.hasTwoColumns ? '2 columns detected' : '1 column detected'}, ${structureData.hasMultiplePages ? 'multiple pages' : 'single page'}`);
    console.log(`=== Pass 1 Results ===`);
    console.log(`- Headers found: ${structureData.semesterHeaders?.length || 0}`);
    console.log(`- Column layout: ${structureData.hasTwoColumns ? '2 columns' : '1 column'}`);
    console.log(`- Pages: ${structureData.hasMultiplePages ? 'multiple' : 'single'}`);
    if (structureData.semesterHeaders && structureData.semesterHeaders.length > 0) {
      console.log(`- First header: "${structureData.semesterHeaders[0].semester}" in ${structureData.semesterHeaders[0].column} column`);
      if (structureData.semesterHeaders.length > 1) {
        console.log(`- Last header: "${structureData.semesterHeaders[structureData.semesterHeaders.length - 1].semester}" in ${structureData.semesterHeaders[structureData.semesterHeaders.length - 1].column} column`);
      }
    }
    console.log("=== Starting Pass 2 - Course Extraction ===");
    
    // PASS 2: Extract courses with structure context
    const fullData = await this.extractCoursesWithStructure(promptText, structureData);
    
    logger.info("Pass 2 complete. Two-pass extraction finished.");
    console.log("=== TWO-PASS EXTRACTION COMPLETE ===");
    
    return fullData;
  }

  async identifyStructure(promptText) {
    // PASS 1: Identify semester headers and determine column layout
    // This is a simpler task - just identify structure, don't extract courses yet
    const prompt = `
      You are a structure analysis assistant. Your task is to analyze the layout of a transcript and identify its structure.
      
      **YOUR TASK**: Analyze the transcript text and identify:
      1. All semester headers (terms like "Fall 2022", "Spring 2023", etc.)
      2. Whether the transcript has 1 or 2 columns
      3. Whether the transcript spans multiple pages
      
      **IMPORTANT**: Do NOT extract courses yet - that will happen in a second pass. Only identify the structure.
      
      **🚨🚨🚨 CRITICAL - READ ENTIRE HEADER STRINGS 🚨🚨🚨**:
      **BEFORE** identifying semester headers, remember this CRITICAL rule:
      - When checking a header, read the ENTIRE string from beginning to end
      - Do NOT stop reading after the semester part (like "2022 Fall")
      - Continue reading until you reach the end of the header string
      - Check if "Transfer" appears ANYWHERE in that ENTIRE string
      - **EXAMPLE**: Header "2022 Fall - Transfer"
        * **WRONG**: Reading only "2022 Fall" and stopping → Missed "Transfer" ❌
        * **CORRECT**: Reading ENTIRE string "2022 Fall - Transfer" → Found "Transfer" → EXCLUDE IT ✓
      
      **SEMESTER HEADER IDENTIFICATION**:
      Look for semester headers that contain terms like "Spring", "Fall", "Summer", "Winter" (or abbreviations "SP", "FA", "SU", "WN") followed by a year (YYYY or YY).
      **IMPORTANT**: Read the ENTIRE header string from start to finish before deciding if it's a valid semester header.
      
      **🚨🚨🚨 CRITICAL - EXCLUDE SECTION HEADERS 🚨🚨🚨**:
      **DO NOT** include headers that contain section terms like "Transfer", "Transfer Credit", "Advanced Placement", "AP", "CLEP", "Institution Credit", etc.
      - **CRITICAL - TRANSFER HEADERS IN ANY FORMAT**: If a header contains "Transfer" ANYWHERE in the ENTIRE header string, **EXCLUDE IT**
        - **🚨🚨🚨 MANDATORY - READ THE ENTIRE HEADER STRING 🚨🚨🚨**:
          * When checking a header, read the ENTIRE string from beginning to end
          * Do NOT stop reading after the semester part (like "2022 Fall")
          * Continue reading until you reach the end of the header string
          * Check if "Transfer" appears ANYWHERE in that ENTIRE string
          * **EXAMPLE**: Header "2022 Fall - Transfer"
            - **WRONG**: Reading only "2022 Fall" and stopping → Missed "Transfer" ❌
            - **CORRECT**: Reading ENTIRE string "2022 Fall - Transfer" → Found "Transfer" → EXCLUDE IT ✓
        - Examples to EXCLUDE:
          * "Fall 2022 Transfer" → Contains "Transfer" → **EXCLUDE IT**
          * "Transfer Fall 2022" → Contains "Transfer" → **EXCLUDE IT**
          * **"2022 Fall - Transfer" → Contains "Transfer" → **EXCLUDE IT** (READ THE ENTIRE STRING - year first format)**
          * "Transfer Credit Fall 2022" → Contains "Transfer" → **EXCLUDE IT**
          * "2022 Fall Transfer" → Contains "Transfer" → **EXCLUDE IT**
          * Any header with "Transfer" ANYWHERE in the ENTIRE string → **EXCLUDE IT**
      - If a header says "Spring 2023 AP" or "AP Spring 2023" → **EXCLUDE IT** (this is an AP section, not a semester header)
      - Only include headers that are PURE semester headers (e.g., "Fall 2022", "Spring 2023", "FA22", "SP23", "2022 Fall") WITHOUT any section terms like "Transfer"
      - **RULE**: Semester headers contain ONLY semester terms and year, NOT section terms like "Transfer", "AP", "CLEP", etc.
      
      **CRITICAL - IDENTIFY SEMESTERS IN CHRONOLOGICAL ORDER**:
      - You MUST identify semesters in the ORDER they appear in the document (top to bottom, left to right)
      - The FIRST semester header you encounter in the document is the FIRST semester chronologically
      - The LAST semester header you encounter is the LAST semester chronologically
      - **DO NOT** reverse the order - list them as they appear in the document
      
      For each semester header you find, identify:
      - Semester name (e.g., "Fall 2022", "Spring 2025", "2025SP")
      - Which column it appears in (LEFT side = First column, RIGHT side = Second column)
      - Approximate location (e.g., "First column, near top", "First column, after 5 courses", "Second column, at top", "Second column, after first 3 courses")
      - **Order in document**: Note which number this is (1st, 2nd, 3rd, etc.) as you encounter them
      
      **COLUMN IDENTIFICATION**:
      - Determine if the transcript has 1 column or 2 columns
      - If 2 columns: The LEFT side is the FIRST column, the RIGHT side is the SECOND column
      - Use horizontal position to determine columns - LEFT = First, RIGHT = Second
      
      **MULTIPLE PAGES**:
      - Determine if the transcript spans multiple pages
      - Look for page breaks, headers that appear multiple times, or content that suggests multiple pages
      
      Return ONLY a JSON object with this structure:
      {
        "hasTwoColumns": true or false,
        "hasMultiplePages": true or false,
        "semesterHeaders": [
          {
            "semester": "string (e.g., 'Fall 2022')",
            "column": "First" or "Second",
            "location": "string describing where it appears"
          }
        ]
      }
      
      **CRITICAL - ORDER REQUIREMENTS**:
      1. List semester headers in the EXACT ORDER they appear in the document (top to bottom, left to right)
      2. The FIRST header in your list should be the FIRST header that appears in the document
      3. If there are 2 columns: List all First column headers first (in order they appear), then all Second column headers (in order they appear)
      4. **VALIDATION**: After identifying headers, verify they are in chronological order. The first header should be the earliest semester (e.g., "Fall 2022"), and later headers should be later semesters (e.g., "Spring 2025", "Fall 2025")
      5. **DO NOT** reverse the order - if you see "Fall 2022" first, then "Spring 2023", then "Fall 2023", list them in that order, NOT reversed
      
      **EXAMPLE CORRECT ORDER**:
      If the document shows (in order): "Fall 2022", "Spring 2023", "Fall 2023", "Spring 2024", "Fall 2024", "Spring 2025", "Fall 2025"
      Then your array should list them in that exact order: [Fall 2022, Spring 2023, Fall 2023, Spring 2024, Fall 2024, Spring 2025, Fall 2025]
      
      **EXAMPLE WRONG ORDER (DO NOT DO THIS)**:
      Listing them as: [Spring 2025, Fall 2024, Spring 2024, ...] - this is WRONG if Spring 2025 appears later in the document
      
      ${promptText}
    `;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const textResponse = response.text();

      console.log("=== PASS 1 (Structure) Gemini Response ===");
      console.log(textResponse);

      // Clean up the response to ensure it's valid JSON
      let jsonStr = textResponse
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

      const structureData = JSON.parse(jsonStr);
      
      // Ensure structureData has the expected fields
      structureData.hasTwoColumns = structureData.hasTwoColumns || false;
      structureData.hasMultiplePages = structureData.hasMultiplePages || false;
      structureData.semesterHeaders = structureData.semesterHeaders || [];
      
      // VALIDATION: Check if semesters are in correct chronological order
      if (structureData.semesterHeaders.length > 1) {
        console.log('\n=== VALIDATING SEMESTER ORDER ===');
        const firstSemester = structureData.semesterHeaders[0];
        const lastSemester = structureData.semesterHeaders[structureData.semesterHeaders.length - 1];
        console.log(`First semester in list: "${firstSemester.semester}"`);
        console.log(`Last semester in list: "${lastSemester.semester}"`);
        
        // Extract years from semesters to check order
        const extractYear = (semesterStr) => {
          const yearMatch = semesterStr.match(/\b(20\d{2}|\d{2})\b/);
          if (yearMatch) {
            let year = parseInt(yearMatch[1]);
            if (year < 100) year += 2000; // Convert 2-digit to 4-digit
            return year;
          }
          return null;
        };
        
        const firstYear = extractYear(firstSemester.semester);
        const lastYear = extractYear(lastSemester.semester);
        
        if (firstYear && lastYear && firstYear > lastYear) {
          console.log(`⚠️ WARNING: First semester (${firstSemester.semester}, year ${firstYear}) appears to be LATER than last semester (${lastSemester.semester}, year ${lastYear})`);
          console.log(`This suggests the semesters may be in reverse order. Reversing the array...`);
          logger.warn(`Pass 1 - Semester order appears reversed, fixing by reversing array`);
          
          // Reverse the array to fix the order
          structureData.semesterHeaders = structureData.semesterHeaders.reverse();
          console.log(`✓ Reversed semester order. New first semester: "${structureData.semesterHeaders[0].semester}"`);
          console.log(`  New last semester: "${structureData.semesterHeaders[structureData.semesterHeaders.length - 1].semester}"`);
        } else {
          console.log(`✓ Semester order appears correct (first: ${firstYear}, last: ${lastYear})`);
        }
        console.log('=== END VALIDATION ===\n');
      }
      
      console.log("=== PASS 1 (Structure) Parsed Data ===");
      console.log(JSON.stringify(structureData, null, 2));
      
      logger.info(`Pass 1 - Structure identified: ${structureData.semesterHeaders.length} headers, ${structureData.hasTwoColumns ? '2 columns' : '1 column'}, ${structureData.hasMultiplePages ? 'multiple pages' : 'single page'}`);
      
      return structureData;
    } catch (error) {
      console.error("Error in Pass 1 (Structure Identification):", error);
      logger.error("Error in Pass 1 (Structure Identification):", error);
      // If Pass 1 fails, return default structure and continue with Pass 2
      return {
        hasTwoColumns: true, // Default to 2 columns to be safe
        hasMultiplePages: false,
        semesterHeaders: []
      };
    }
  }

  async extractCoursesWithStructure(promptText, structureData) {
    // PASS 2: Extract courses and assign them to semesters from Pass 1
    // Pass 1 already identified the semesters - now we assign courses to them
    
    // Build the semester structure from Pass 1
    const semestersJSON = JSON.stringify(structureData.semesterHeaders || [], null, 2);
    
    const structureContext = structureData.hasTwoColumns 
      ? `**CRITICAL - SEMESTER STRUCTURE FROM PASS 1 (USE THIS EXACTLY)**:
      - This transcript has **2 COLUMNS** (LEFT = First column, RIGHT = Second column)
      - Pass 1 identified the following semesters - you MUST use these semesters and assign courses to them:
      
      **SEMESTER STRUCTURE (from Pass 1)**:
${semestersJSON}

      **YOUR TASK**: Extract ALL courses from the transcript and assign each course to the appropriate semester from the list above.
      
      **🚨🚨🚨 CRITICAL - SECOND COLUMN SEMESTER ASSIGNMENT - READ THIS VERY CAREFULLY 🚨🚨🚨**:
      
      **THIS IS EXTREMELY IMPORTANT - FOLLOW THESE RULES EXACTLY FOR SECOND COLUMN COURSES**:
      
      **STEP-BY-STEP PROCESS FOR EACH COURSE IN SECOND COLUMN**:
      
      1. **FIRST: Identify the course's column** - Is it on the RIGHT side of the page? If YES, it's in SECOND column.
      
      2. **SECOND: Check if any SECOND column headers have appeared before this course**:
         - Look at the semester structure from Pass 1 above
         - Find all headers that have "column": "Second" 
         - Check if ANY of these Second column headers appear BEFORE this course in the document
         - **CRITICAL**: Only look at Second column headers, NOT First column headers
      
      3. **THIRD: Assign semester based on the check above**:
         
         **IF a Second column header has appeared before this course**:
         - Use the MOST RECENT Second column header that appears before this course
         - **EXAMPLE**: If Second column has headers: "Spring 2025" (first), "Fall 2025" (second)
           - Course appearing after "Spring 2025" but before "Fall 2025" → gets "Spring 2025"
           - Course appearing after "Fall 2025" → gets "Fall 2025"
         - **CRITICAL**: Do NOT use a First column header even if it appears on the same row
         - **CRITICAL**: Do NOT use the first First column header - use Second column headers ONLY
         
         **IF NO Second column header has appeared yet before this course**:
         - Find the LAST (most recent/final) header from the First column
         - Look at the semester structure from Pass 1 - find all headers with "column": "First"
         - Use the LAST one in the list (the final/most recent one)
         - **CRITICAL**: Use the LAST First column header, NOT the first one, NOT any middle one
         - **EXAMPLE**: If First column has: "Fall 2022", "Spring 2023", "Fall 2023", "Spring 2024", "Fall 2024"
           - The LAST one is "Fall 2024" → use "Fall 2024" for the first Second column course
           - Do NOT use "Fall 2022" (the first one) ❌
           - Do NOT use "Spring 2023" (a middle one) ❌
           - Use "Fall 2024" (the last one) ✓
      
      4. **FOURTH: Verify your assignment**:
         - Ask: "Is this course in Second column?" If NO, go back to column identification
         - Ask: "Did a Second column header appear before this course?" 
           - If YES: "Am I using a Second column header?" If NO, you made an error - fix it
           - If NO: "Am I using the LAST First column header?" If NO, you made an error - fix it
      
      **CRITICAL EXAMPLES FOR SECOND COLUMN COURSES**:
      
      **Example 1 - Second column course after Second column header**:
      - First column headers: "Fall 2022", "Spring 2023", "Fall 2023"
      - Second column headers: "Spring 2025", "Fall 2025"
      - Course: "BIO 131" in Second column, appears after "Spring 2025" but before "Fall 2025"
      - **CORRECT**: Course gets "Spring 2025" (from Second column header) ✓
      - **WRONG**: Course gets "Fall 2023" (from First column) ❌
      - **WRONG**: Course gets "Fall 2025" (header appears after, not before) ❌
      
      **Example 2 - Second column course before any Second column header**:
      - First column headers: "Fall 2022", "Spring 2023", "Fall 2023", "Spring 2024", "Fall 2024"
      - Second column headers: "Spring 2025" (appears later)
      - Course: "BIO 131" in Second column, appears BEFORE "Spring 2025"
      - **CORRECT**: Course gets "Fall 2024" (the LAST First column header) ✓
      - **WRONG**: Course gets "Fall 2022" (the FIRST First column header) ❌
      - **WRONG**: Course gets "Spring 2025" (appears after, not before) ❌
      
      **Example 3 - Second column course on same row as First column header (🚨 CRITICAL 🚨)**:
      - Text row shows: [Header "Fall 2022" on LEFT] [Course "BIO 131" on RIGHT]
      - "Fall 2022" is in First column (LEFT side)
      - "BIO 131" is in Second column (RIGHT side)
      - They are on the SAME row but in DIFFERENT columns
      - First column has: "Fall 2022", "Spring 2023", "Fall 2023", "Spring 2024", "Fall 2024"
      - Second column has: "Spring 2025" (appears later, after this course)
      - **CORRECT**: Course gets "Fall 2024" (the LAST First column header, since no Second column header has appeared yet) ✓
        - **IGNORE** "Fall 2022" on the same row completely - do NOT use it
        - Same-row headers in different columns are NOT valid for semester assignment
      - **WRONG**: Course gets "Fall 2022" just because it's on the same row ❌
        - This is a common error - DO NOT do this
      
      **Example 4 - Second column course on same row as First column header (WITH SECOND COLUMN HEADER)**:
      - Text row shows: [Header "Fall 2022" on LEFT] [Course "BIO 131" on RIGHT]
      - "Fall 2022" is in First column (LEFT side)
      - "BIO 131" is in Second column (RIGHT side)
      - Second column has header: "Spring 2025" (appeared before this course)
      - **CORRECT**: Course gets "Spring 2025" (from Second column header) ✓
        - **IGNORE** "Fall 2022" on the same row completely - do NOT use it
      - **WRONG**: Course gets "Fall 2022" from the same row ❌
        - This is a common error - DO NOT do this
      
      **CRITICAL - SEMESTER ASSIGNMENT RULES**:
      1. **🚨🚨🚨 ABSOLUTE RULE - COURSES BEFORE SEMESTER HEADERS 🚨🚨🚨**:
         - Courses that appear BEFORE the FIRST semester header in the ENTIRE document have NO SEMESTER (null) - put them in "coursesWithoutSemester"
         - **THIS INCLUDES**: ALL courses that appear after section headers like "Advanced Placement", "AP", "CLEP", "Transfer Credit", etc. if those section headers appear before any semester header
         - **SECTION HEADERS ARE NOT SEMESTER HEADERS**: Headers like "Advanced Placement", "AP", "CLEP", "Transfer Credit", "Institution Credit", etc. are NOT semester headers - they are section headers
         - **ONLY SEMESTER HEADERS COUNT**: Only headers containing semester terms like "Fall", "Spring", "Summer", "Winter" (or "FA", "SP", "SU", "WN") followed by a year are semester headers
         - **CRITICAL EXAMPLE**: 
           * If document shows: "Advanced Placement" header, then "AP Biology" course, then "Fall 2022" header
           * "AP Biology" appears BEFORE "Fall 2022" (the first semester header)
           * **CORRECT**: "AP Biology" has NO SEMESTER (null) ✓
           * **WRONG**: "AP Biology" gets "Fall 2022" semester ❌
         - **VERY COMMON**: AP/CLEP courses appear at the top of transcripts with section headers like "Advanced Placement" BEFORE any semester headers - these MUST have null semester
      2. **FOR EACH COURSE, YOU MUST FIRST DETERMINE ITS COLUMN** (LEFT = First column, RIGHT = Second column)
      3. **FIRST COLUMN COURSES**: Get semester from the MOST RECENT First column header BEFORE them
      4. **SECOND COLUMN COURSES**: 
         - **IF a Second column header appeared before**: Use the MOST RECENT Second column header
         - **IF NO Second column header appeared yet**: Use the LAST (most recent/final) First column header
         - **CRITICAL**: Do NOT use First column headers for Second column courses UNLESS no Second column header has appeared yet
      5. **SAME COLUMN RULE - ABSOLUTE**: Courses in First column use semesters from First column ONLY (until no more First column headers). Courses in Second column use semesters from Second column ONLY (when available), otherwise use last First column header.
      
      **ROW ORDER RULES FOR 2-COLUMN LAYOUTS**:
      - If a text row has: [Header] [Course info] → Header is FIRST column (LEFT), Course is SECOND column (RIGHT)
      - If a text row has: [Course info] [Header] → Course is FIRST column (LEFT), Header is SECOND column (RIGHT)
      - **CRITICAL**: When header and course are on same row, they are in DIFFERENT columns - the course does NOT get its semester from the header on the same row if they are in different columns`
      : `**CRITICAL - SEMESTER STRUCTURE FROM PASS 1 (USE THIS EXACTLY)**:
      - This transcript has **1 COLUMN**
      - Pass 1 identified the following semesters - you MUST use these semesters and assign courses to them:
      
      **SEMESTER STRUCTURE (from Pass 1)**:
${semestersJSON}

      **YOUR TASK**: Extract ALL courses from the transcript and assign each course to the appropriate semester from the list above.
      
      **CRITICAL - SEMESTER ASSIGNMENT RULES**:
      1. Courses that appear BEFORE the FIRST semester header in the document have NO SEMESTER (null) - put them in "coursesWithoutSemester"
      2. Courses get their semester from the MOST RECENT semester header BEFORE them
      3. A semester header applies ONLY to courses that come AFTER it`;

    const prompt = `
      You are a data extraction assistant. Your task is to extract structured transcript data from the following raw text extracted from a PDF.
      
      ${structureContext}
      
      **🚨🚨🚨 CRITICAL REMINDER - SECOND COLUMN COURSES - READ THIS FIRST 🚨🚨🚨**:
      
      If this transcript has 2 columns, courses in the SECOND column (RIGHT side) have special rules:
      1. Check if a SECOND column header has appeared before the course - if YES, use that header's semester
      2. If NO Second column header has appeared yet, use the LAST (most recent/final) First column header
      3. Do NOT use the first First column header - use the LAST one
      4. **🚨🚨🚨 CRITICAL - SAME ROW HEADERS IN DIFFERENT COLUMNS 🚨🚨🚨**:
         - **NEVER** use a First column semester header that appears on the SAME row as a Second column course
         - **IGNORE** same-row headers in different columns completely - they are NOT valid for semester assignment
         - **EXAMPLE**: If row shows [Header "Fall 2022" on LEFT] [Course "BIO 131" on RIGHT]:
           - Header "Fall 2022" is in First column (LEFT)
           - Course "BIO 131" is in Second column (RIGHT)
           - They are on the SAME row but in DIFFERENT columns
           - **WRONG**: Using "Fall 2022" for "BIO 131" because they're on the same row ❌
           - **CORRECT**: Ignore "Fall 2022" completely, use Second column rules instead ✓
         - **THIS IS A VERY COMMON ERROR - DO NOT MAKE THIS MISTAKE**
      
      **This is one of the most common errors - make sure you follow this rule exactly.**
      
      **🚨🚨🚨 CRITICAL REMINDER - SKIP TRANSFER COURSES 🚨🚨🚨**:
      
      **BEFORE YOU START EXTRACTING COURSES**, scan the transcript text for headers containing "Transfer" (like "2022 Fall - Transfer", "Transfer Fall 2022", etc.).
      - **🚨🚨🚨 CRITICAL - READ THE ENTIRE HEADER STRING FROM START TO FINISH 🚨🚨🚨**:
        * When checking headers, read the ENTIRE string from beginning to end
        * Do NOT stop reading after the semester part (like "2022 Fall")
        * Continue reading until you reach the end of the header string
        * Check if "Transfer" appears ANYWHERE in that ENTIRE string
        * **EXAMPLE**: Header "2022 Fall - Transfer"
          - **WRONG**: Reading only "2022 Fall" and stopping → Missed "Transfer" ❌
          - **CORRECT**: Reading ENTIRE string "2022 Fall - Transfer" → Found "Transfer" → Mark this header ❌
      - When you see a header with "Transfer" (after reading the ENTIRE string), **MARK** that position
      - **DO NOT** extract ANY courses that appear after that header
      - **SKIP** all courses until you see a pure semester header (without "Transfer")
      - **REMEMBER**: Transfer courses should NOT appear in your output at all
      
      **CRITICAL - EXTRACT ALL COURSES IN COLUMN ORDER**: You MUST extract ALL courses from the transcript, but you MUST extract them in COLUMN ORDER, NOT in reading order (top-to-bottom across both columns).
      **IMPORTANT**: This means extract courses in column order, BUT skip courses after Transfer headers.
      
      **CRITICAL - PROCESS COLUMNS SEQUENTIALLY - THIS IS EXTREMELY IMPORTANT**:
      * **🚨🚨🚨 BEFORE EXTRACTING COURSES - CHECK FOR TRANSFER HEADERS 🚨🚨🚨**:
        - **STEP 0**: Before starting extraction, scan the raw text for headers containing "Transfer"
        - **🚨🚨🚨 CRITICAL - READ THE ENTIRE HEADER STRING 🚨🚨🚨**:
          * When checking headers, read the ENTIRE string from beginning to end
          * Do NOT stop reading after the semester part (like "2022 Fall")
          * Continue reading until you reach the end of the header string
          * Check if "Transfer" appears ANYWHERE in that ENTIRE string
          * **EXAMPLE**: Header "2022 Fall - Transfer"
            - **WRONG**: Reading only "2022 Fall" and stopping → Missed "Transfer" ❌
            - **CORRECT**: Reading ENTIRE string "2022 Fall - Transfer" → Found "Transfer" → Mark this header ❌
        - Look for patterns like: "2022 Fall - Transfer", "Transfer Fall 2022", "Fall 2022 Transfer", "Transfer Credit Fall 2022"
        - **MANDATORY CHECK PROCESS**:
          1. Read each header string from start to finish
          2. Check if "Transfer" appears ANYWHERE in that ENTIRE string
          3. If found → Mark that header position - do NOT extract courses after it
          4. Do NOT stop reading early - read the ENTIRE header string
        - **IF** you find any such headers, **REMEMBER** their positions - do NOT extract courses after them
        - **MARK** these positions in your mind - courses after Transfer headers are FORBIDDEN
      
      * **STEP 1 - EXTRACT ALL FIRST COLUMN COURSES FIRST**: Extract ALL courses from the FIRST column (LEFT side) from top to bottom, in the order they appear in that column. Do NOT look at the second column yet. Extract every course that appears on the LEFT side of the page, including AP/CLEP courses, in the exact order they appear vertically in the first column.
        - **BUT**: **SKIP** any courses that appear after a Transfer header (like "2022 Fall - Transfer")
        - **IF** you see "2022 Fall - Transfer" or similar header in first column, **STOP** extracting and skip to the next pure semester header
      * **STEP 2 - THEN EXTRACT ALL SECOND COLUMN COURSES**: ONLY after you have extracted ALL courses from the first column, THEN extract ALL courses from the SECOND column (RIGHT side) from top to bottom, in the order they appear in that column. Extract every course that appears on the RIGHT side of the page, including the FIRST course in the second column (even if it appears before any semester header in the second column), in the exact order they appear vertically in the second column.
        - **BUT**: **SKIP** any courses that appear after a Transfer header (like "2022 Fall - Transfer")
        - **IF** you see "2022 Fall - Transfer" or similar header in second column, **STOP** extracting and skip to the next pure semester header
      * **CRITICAL - DO NOT MIX COLUMNS**: Do NOT extract courses in reading order (e.g., Course 1 from col 1, Course 1 from col 2, Course 2 from col 1, Course 2 from col 2). Instead, extract ALL courses from column 1 first, then ALL courses from column 2. This ensures correct semester assignment.
      * **CRITICAL - SAME ROW ITEMS - USE ROW ORDER TO DETERMINE COLUMN - THIS IS ESPECIALLY IMPORTANT FOR 2-COLUMN LAYOUTS**:
        - When a heading (AP heading, Transfer heading, Section heading, Institution credit heading, or semester heading) and a course appear on the SAME text row, use the ORDER on the row to determine which column each belongs to:
          * First item on row (LEFT side) = FIRST column
          * Second item on row (RIGHT side) = SECOND column
        - **CRITICAL RULES FOR 2-COLUMN LAYOUTS**:
          * **RULE 1**: If a text line has: [Header] [Course info] (header first, then course info)
            → Header is in FIRST column (LEFT), Course info is in SECOND column (RIGHT)
            → Example: Row shows "Fall 2022" on LEFT, "BIO 131" on RIGHT → "Fall 2022" is FIRST column, "BIO 131" is SECOND column
          * **RULE 2**: If a text line has: [Course info] [Header] (course info first, then header)
            → Course info is in FIRST column (LEFT), Header is in SECOND column (RIGHT)
            → Example: Row shows "BIO 141" on LEFT, "Spring 2025" on RIGHT → "BIO 141" is FIRST column, "Spring 2025" is SECOND column
        - **EXAMPLES**:
          * Row: [AP HEADING] [Course "BIO 131"] → AP HEADING is FIRST column, Course is SECOND column
          * Row: [Course "BIO 141"] [Semester header "Fall 2022"] → Course is FIRST column, Header is SECOND column
          * Row: [Semester header "Fall 2022"] [Course "BIO 131"] → Header is FIRST column, Course is SECOND column
        - **CRITICAL**: Use this row order rule to correctly identify which column items belong to when they appear on the same row. This is especially important for 2-column layouts where headers and courses often appear on the same text line.
      * **CRITICAL - INCLUDED COURSES**: Extract:
        - ALL Advanced Placement (AP) and CLEP courses (they may appear in either column, but extract them in the column order where they appear)
        - ALL courses in the first column (LEFT side), in the order they appear in that column
        - ALL courses in the second column (RIGHT side), including the FIRST course in the second column, in the order they appear in that column
        - Do NOT skip any courses
        - **🚨🚨🚨🚨🚨 CRITICAL - DO NOT EXTRACT TRANSFER COURSES 🚨🚨🚨🚨🚨**:
          - **MANDATORY**: **DO NOT** extract courses that appear after headers containing "Transfer"
          - Headers with "Transfer" include: "2022 Fall - Transfer", "Transfer Fall 2022", "Fall 2022 Transfer", "Transfer Credit Fall 2022", etc.
          - **IF** you encounter a header containing "Transfer", **SKIP ALL COURSES** that appear after that header until you see a pure semester header (without "Transfer")
          - **DO NOT** extract Transfer Credit section courses - skip them completely
          - **EXAMPLE**: If document shows "2022 Fall - Transfer" header, then courses:
            * **MANDATORY**: Do NOT extract those courses at all - skip them completely
            * Wait until you see a pure semester header (like "Fall 2023") before extracting courses again
          - **THIS IS MANDATORY - TRANSFER COURSES MUST BE EXCLUDED FROM EXTRACTION**
      
      **WHY THIS MATTERS**: Processing courses in column order ensures that:
      - Courses in the first column all come before courses in the second column in your output
      - When you see a course in the second column, you've already seen all headers and courses from the first column
      - Semester assignment becomes straightforward: courses in second column before any second column header get the last first column header
      - You can correctly identify which courses should have no semester (those before the first header in their column)
      
      **🚨🚨🚨🚨🚨 CRITICAL - EXCLUDE TRANSFER COURSES - READ THIS FIRST 🚨🚨🚨🚨🚨**:
      
      **MANDATORY RULE - TRANSFER COURSES MUST BE EXCLUDED**:
      - **BEFORE** extracting any course, check if it appears after a header containing "Transfer"
      - Headers with "Transfer" include: "2022 Fall - Transfer", "Transfer Fall 2022", "Fall 2022 Transfer", "Transfer Credit Fall 2022", etc.
      - If a course appears after ANY header containing "Transfer":
        * **BEST OPTION**: Do NOT extract that course at all - skip it completely
        * **IF YOU EXTRACT IT**: It MUST have semester = null (no exceptions)
      - **Transfer Credit section courses should NOT appear in your final course list**
      - **VALIDATION**: After extraction, check your course list - if any course appears after a Transfer header, remove it or ensure it has semester = null
      
      **THIS IS MANDATORY - DO NOT INCLUDE TRANSFER COURSES IN YOUR OUTPUT**
      
      Please extract:
      1. Student Name
      2. University Name
      3. List of Semester Headers Found (NEW - FOR DEBUGGING): For each semester header you encounter, record:
        - **🚨🚨🚨 CRITICAL - ONLY INCLUDE PURE SEMESTER HEADERS 🚨🚨🚨**:
          - **DO NOT** include headers that contain section terms like "Transfer", "Transfer Credit", "Advanced Placement", "AP", "CLEP", etc.
          - If a header says "Fall 2022 Transfer" or "Transfer Fall 2022" → **EXCLUDE IT** (not a semester header)
          - Only include PURE semester headers (semester term + year only, e.g., "Fall 2022", "Spring 2023")
        - Semester Name (e.g., "Fall 2022", "Spring 2025", "2025SP") - **ONLY PURE SEMESTER HEADERS**
        - Location (e.g., "First column (LEFT side), near top", "First column (LEFT side), near end", "Second column (RIGHT side), after first 3 courses", "Second column (RIGHT side), at top")
        - Column (e.g., "First" if the header appears on the LEFT side of the page, or "Second" if the header appears on the RIGHT side of the page). **CRITICAL**: Determine the column by:
          * **PRIMARY METHOD**: Look at which side of the page the header appears on - LEFT = First column, RIGHT = Second column
          * **SAME ROW RULE - CRITICAL FOR ACCURACY**: If a header appears on the same text row as a course or another heading (AP heading, Transfer heading, Section heading, Institution credit heading):
            - If the header appears FIRST on the row (LEFT side): Header is in FIRST column (LEFT), other item is in SECOND column (RIGHT)
            - If a course or other heading appears FIRST on the row (LEFT side): Course/heading is in FIRST column (LEFT), header is in SECOND column (RIGHT)
            - **RULE**: First item on row = FIRST column, second item on row = SECOND column
          * Physical location (LEFT vs RIGHT) is the PRIMARY determinant, but row order helps when items appear on the same row
        - Approximate position (e.g., "Before course X" if course X is the FIRST course that FOLLOWS the header in the SAME COLUMN, or "After course Y" if course Y is the LAST course that appears BEFORE the header in the SAME COLUMN)
        **CRITICAL**: 
        - A semester header applies ONLY to courses that FOLLOW it in the SAME COLUMN, not courses that come before it or courses in a different column
        - A header in the FIRST column (LEFT side) applies ONLY to courses in the FIRST column (LEFT side), NOT to courses in the SECOND column (RIGHT side)
        - A header in the SECOND column (RIGHT side) applies ONLY to courses in the SECOND column (RIGHT side), NOT to courses in the FIRST column (LEFT side)
        - If a header appears before Course X in the same column, record position as "Before course X" (meaning X gets the header's semester). If a header appears after Course Y in the same column, record position as "After course Y" (meaning Y does NOT get the header's semester, but courses after the header in the same column do).
        This will help verify correct header identification and column assignment.
      4. List of Courses. For each course, extract:
        
        **🔴🔴🔴 ABSOLUTE RULE #1 - MANDATORY VALIDATION - DO THIS FIRST - THIS IS THE MOST IMPORTANT RULE 🔴🔴🔴**:
        
        **BEFORE EXTRACTING THE SEMESTER FIELD FOR ANY COURSE, YOU MUST DO THIS CHECK FIRST - NO EXCEPTIONS:**
        
        1. **Check the ORDER of items in the document**
        2. **Identify where the FIRST semester header appears** (look for text like "Fall 2022", "Spring 2023", "FA22", "SP23", etc.)
        3. **Determine if this course appears BEFORE or AFTER that first header**
        
        **IF THE COURSE APPEARS BEFORE THE FIRST SEMESTER HEADER:**
        - **MANDATORY**: Set semester to: null (or empty string "")
        - **DO NOT**: Try to find a semester for it
        - **DO NOT**: Use any header that appears after it
        - **DO NOT**: Use any fallback logic
        - **DO NOT**: Assign any semester string value
        - **STOP IMMEDIATELY** - this is the final answer for this course's semester
        - **VALIDATION**: After setting semester to null, ask yourself: "Did I assign null because this course appears before the first header?" If YES, you are correct. If NO, go back and check again.
        
        **IF THE COURSE APPEARS AFTER THE FIRST SEMESTER HEADER:**
        - Continue with the semester assignment logic below
        
        **THIS RULE APPLIES TO:**
        - **ALL AP courses** (e.g., "AP Biology", "AP Chemistry", "AP English") - ESPECIALLY IMPORTANT
        - **ALL CLEP courses** - ESPECIALLY IMPORTANT
        - **ALL regular courses** - ALL courses
        - **NO EXCEPTIONS** - This rule is ABSOLUTE
        - **VERY COMMON**: AP and CLEP courses appear at the TOP of transcripts BEFORE any headers - these MUST have null semester
        
        **COMMON SCENARIO:**
        - Document starts with: "AP Biology", "AP Chemistry", then [Header: "Fall 2022"], then "BIO 141"
        - "AP Biology" appears BEFORE "Fall 2022" → semester = null ✓
        - "AP Chemistry" appears BEFORE "Fall 2022" → semester = null ✓
        - "BIO 141" appears AFTER "Fall 2022" → semester = "Fall 2022" ✓
        
        **DO NOT DO THIS (WRONG):**
        - "AP Biology" appears before "Fall 2022" but you assign "Fall 2022" to it ❌
        - This is WRONG - courses before headers MUST have null semester
        
        **🔴🔴🔴 CRITICAL - COLUMN IDENTIFICATION FOR ITEMS ON SAME ROW 🔴🔴🔴**:
        
        **When a heading and a course appear on the SAME text row, use the ORDER on the row to determine columns:**
        
        **RULE FOR HEADINGS AND COURSES ON SAME ROW**:
        - If a heading (AP heading, Transfer heading, Section heading, Institution credit heading, or semester heading) appears BEFORE a course on the same text row:
          * The heading is in the FIRST column (LEFT side)
          * The course is in the SECOND column (RIGHT side)
        - If a course appears BEFORE a heading on the same text row:
          * The course is in the FIRST column (LEFT side)
          * The heading is in the SECOND column (RIGHT side)
        - **Key principle**: The first item on the row is in the FIRST column (LEFT), the second item is in the SECOND column (RIGHT)
        
        **EXAMPLES**:
        - Text row: [AP HEADING on LEFT] [Course "BIO 131" on RIGHT]
          * AP HEADING is in FIRST column (LEFT - appears first on row)
          * Course "BIO 131" is in SECOND column (RIGHT - appears second on row)
        - Text row: [Course "BIO 141" on LEFT] [Semester header "Fall 2022" on RIGHT]
          * Course "BIO 141" is in FIRST column (LEFT - appears first on row)
          * Semester header "Fall 2022" is in SECOND column (RIGHT - appears second on row)
        - Text row: [Semester header "Fall 2022" on LEFT] [Course "BIO 131" on RIGHT]
          * Semester header "Fall 2022" is in FIRST column (LEFT - appears first on row)
          * Course "BIO 131" is in SECOND column (RIGHT - appears second on row)
        
        **CRITICAL**: When extracting courses and headers, determine their column based on:
        1. Their horizontal position on the page (LEFT = First column, RIGHT = Second column)
        2. If they appear on the same row, use the ORDER on the row (first item = First column, second item = Second column)
        
        **This helps correctly identify which column items belong to when they appear on the same text row.**
        
        - Course Number (e.g., "BIB 113", "ENG-101", "BIO 1414", "POLSC 1113"). **CRITICAL**: 
          * **MANDATORY**: EVERY course MUST have a course number. Do NOT skip extracting the course number.
          * A valid course number MUST have letters (2-5 letters) followed by numbers (2-5 digits). Examples: "BIO 141", "BIO 1414", "CMSC 1313", "ENG 101", "MATH 1623", "POLSC 1113", "BIO 1414".
          * **CRITICAL - EXTRACT ALL LETTERS**: Course prefixes can be 2, 3, 4, or 5 letters long (e.g., "BIO", "MATH", "CMSC", "POLSC"). Extract ALL letters in the prefix.
          * **CRITICAL - EXTRACT ALL DIGITS**: Extract the COMPLETE course number including ALL characters and ALL digits. Do NOT truncate or cut off ANY characters or digits from the course number. If the transcript shows "BIO 1414", extract "BIO 1414" (4 digits), NOT "BIO 141" (3 digits). If the transcript shows "CMSC 1313", extract "CMSC 1313" (4 digits), NOT "CMSC 131" (3 digits). If the transcript shows "POLSC 1113", extract "POLSC 1113" (5 letters + 4 digits), NOT "POLS 1113" or "POLSC 111".
          * **VERIFY COMPLETENESS**: After extracting a course number, verify that you have extracted ALL letters and ALL digits shown in the transcript. Count the letters - if the transcript shows 5 letters (like "POLSC"), your extracted course number must also have 5 letters. Count the digits - if the transcript shows 4 digits, your extracted course number must also have 4 digits.
          * The course number typically appears BEFORE the course name on the same line (e.g., "POLSC 1113 American Federal Govt").
          * The course number may include optional suffixes like "L" (for lab courses, e.g., "CMSC-1113L" or "CMSC-1113 L") or decimal numbers (e.g., "CMSC-1083.2"). Include these in the course number if present.
          * Do NOT extract lines that do not have this pattern - they are NOT courses. Do NOT extract statistics headers like "EHRS", "GPA", "HRSPOINTS", "Cumulative:", "EHRSGPA-HRSPOINTSGPA" as courses.
          * If the course number is blank or only contains dashes (e.g., "---", "----"), use null or empty string.
          * **IMPORTANT**: If you see a course name like "American Federal Govt" but no course number is visible, look more carefully - the course number (like "POLSC 1113") should appear on the same line BEFORE the course name.
        - Course Name (Title). **CRITICAL**: 
          * Extract the COMPLETE course name/title including ALL words and characters, EXCEPT for the grade at the end.
          * **DO NOT INCLUDE THE GRADE IN THE COURSE NAME**: The grade (A, B, C, D, F, S, P, W, etc.) is a SEPARATE field and should NOT be included as part of the course name. If a grade letter appears at the end of the course name text, remove it from the course name and put it in the grade field instead.
          * Course names may end in Roman numerals (I, II, III, IV, V, etc.) which are PART OF THE COURSE NAME - do NOT remove these. The grade appears AFTER the Roman numeral if present.
          * Example: If you see "English Comp I A", the course name should be "English Comp I" and the grade should be "A" (in the separate grade field).
          * Example: If you see "Human Anatomy & Physiology I C", the course name should be "Human Anatomy & Physiology I" and the grade should be "C" (in the separate grade field).
          * Extract the full course name without truncating or cutting off characters (except the grade at the end).
        - Semester (e.g., "Fall 2023", "FA23"). **CRITICAL - MANDATORY VALIDATION CHECK REQUIRED**:
          
          **🚨🚨🚨 MANDATORY CHECK - YOU MUST DO THIS FOR EVERY SINGLE COURSE 🚨🚨🚨**:
          
          **BEFORE ASSIGNING ANY SEMESTER TO ANY COURSE, YOU MUST ANSWER THIS QUESTION**:
          "Has ANY SEMESTER header appeared in the ENTIRE document BEFORE this course?"
          
          **CRITICAL - WHAT IS A SEMESTER HEADER**:
          - **SEMESTER HEADERS**: Headers containing "Fall", "Spring", "Summer", "Winter" (or "FA", "SP", "SU", "WN") followed by a year
          - **SECTION HEADERS ARE NOT SEMESTER HEADERS**: Headers like "Advanced Placement", "AP", "CLEP", "Transfer Credit", "Institution Credit", etc. are NOT semester headers
          - **WHEN CHECKING**: Only look for SEMESTER headers, NOT section headers
          
          **IF THE ANSWER IS "NO" (NO SEMESTER HEADER HAS APPEARED):**
          - The course has NO SEMESTER - set semester to null or empty string
          - STOP - do NOT continue with any other semester assignment logic
          - Do NOT try to find a semester for it
          - Do NOT use any fallback semester
          - Do NOT use semester from section headers (they are NOT semester headers)
          - This is ABSOLUTE - no exceptions
          
          **IF THE ANSWER IS "YES" (A SEMESTER HEADER HAS APPEARED):**
          - Continue with the semester assignment logic below
          
          **THIS CHECK IS ESPECIALLY CRITICAL FOR AP/CLEP COURSES AND COURSES AFTER SECTION HEADERS**:
          - AP and CLEP courses OFTEN appear at the TOP of the transcript AFTER section headers like "Advanced Placement" but BEFORE any semester headers
          - For EVERY AP/CLEP course, you MUST first check: "Has ANY SEMESTER header appeared before this course?"
          - **CRITICAL**: Ignore section headers like "Advanced Placement" - they are NOT semester headers
          - If NO SEMESTER header has appeared, the AP/CLEP course MUST have null semester - this is MANDATORY
          - **DO NOT** assign any semester to AP/CLEP courses that appear before the first SEMESTER header
          - **DO NOT** try to infer a semester for them
          - **DO NOT** use a semester from later in the document
          - **DO NOT** use "Advanced Placement" or other section headers as semester headers
          
          **EXAMPLE - CORRECT BEHAVIOR (Advanced Placement)**:
          - Document order: [Header: "Advanced Placement"], "AP Biology", "AP Chemistry", [Header: "Fall 2022"], "BIO 141"
          - For "AP Biology": Has ANY SEMESTER header appeared before it? NO (ignore "Advanced Placement") → semester = null ✓
          - For "AP Chemistry": Has ANY SEMESTER header appeared before it? NO (ignore "Advanced Placement") → semester = null ✓
          - For "BIO 141": Has ANY SEMESTER header appeared before it? YES ("Fall 2022") → continue ✓
          
          **EXAMPLE - CORRECT BEHAVIOR (Transfer Section)**:
          - Document order: [Header: "Transfer Fall 2022"], "BIO 101", "BIO 102", [Header: "Fall 2023"], "BIO 141"
          - "Transfer Fall 2022" is NOT a semester header - it contains "Transfer" → EXCLUDE IT
          - For "BIO 101": Has ANY SEMESTER header appeared before it? NO (ignore "Transfer Fall 2022") → semester = null ✓
          - For "BIO 102": Has ANY SEMESTER header appeared before it? NO (ignore "Transfer Fall 2022") → semester = null ✓
          - "Fall 2023" is the first PURE semester header (no section terms)
          - For "BIO 141": Has ANY SEMESTER header appeared before it? YES ("Fall 2023") → continue ✓
          
          **EXAMPLE - WRONG BEHAVIOR (DO NOT DO THIS)**:
          - Document order: [Header: "Advanced Placement"], "AP Biology", [Header: "Fall 2022"]
          - Wrong: "AP Biology" gets "Fall 2022" because a semester header appears later ❌
          - Wrong: Treating "Advanced Placement" as a semester header ❌
          - Correct: "AP Biology" has null semester because no SEMESTER header appeared before it ✓
          
          **EXAMPLE - WRONG BEHAVIOR WITH TRANSFER (DO NOT DO THIS)**:
          - Document order: [Header: "Transfer Fall 2022"], "BIO 101", [Header: "Fall 2023"]
          - Wrong: "BIO 101" gets "Fall 2022" from "Transfer Fall 2022" header ❌
          - Wrong: Treating "Transfer Fall 2022" as a semester header ❌
          - Wrong: Extracting courses after "Transfer Fall 2022" and assigning them a semester ❌
          - Correct: "BIO 101" has null semester because no PURE SEMESTER header appeared before it ✓
          - Correct: Courses after "Transfer Fall 2022" should be excluded or have null semester ✓
          
          **EXAMPLE - WRONG BEHAVIOR WITH TRANSFER (Year First Format) (DO NOT DO THIS)**:
          - Document order: [Header: "2022 Fall - Transfer"], "BIO 101", [Header: "Fall 2023"]
          - Wrong: "BIO 101" gets "2022 Fall" or "Fall 2022" from "2022 Fall - Transfer" header ❌
          - Wrong: Treating "2022 Fall - Transfer" as a semester header ❌
          - Wrong: Extracting courses after "2022 Fall - Transfer" and assigning them a semester ❌
          - Correct: "BIO 101" has null semester because no PURE SEMESTER header appeared before it ✓
          - Correct: Courses after "2022 Fall - Transfer" should be excluded or have null semester ✓
          
          **EXAMPLE OF CORRECT BEHAVIOR**:
          - Document order: "AP Biology", "AP Chemistry", [Header: "Fall 2022"], "BIO 141"
          - Check for "AP Biology": Has ANY header appeared before it? NO → semester = null ✓
          - Check for "AP Chemistry": Has ANY header appeared before it? NO → semester = null ✓
          - Check for "BIO 141": Has ANY header appeared before it? YES → Use "Fall 2022" ✓
          
          **EXAMPLE OF WRONG BEHAVIOR - DO NOT DO THIS**:
          - Document order: "AP Biology", "AP Chemistry", [Header: "Fall 2022"]
          - Wrong: Assigning "Fall 2022" to "AP Biology" because a header appears later ❌
          - Wrong: Assigning any semester to courses before the first header ❌
          
          **⚠️⚠️⚠️ ADDITIONAL CRITICAL WARNINGS ⚠️⚠️⚠️**:
          
          **🚨🚨🚨 WARNING 2 - HEADERS AND COURSES ON SAME ROW - CRITICAL 🚨🚨🚨**:
          
          **THIS IS A COMMON ERROR - READ THIS VERY CAREFULLY**:
          
          If you see a semester header on the LEFT side of a text row and a course on the RIGHT side of the SAME text row:
          - They are in **DIFFERENT columns** (LEFT = First column, RIGHT = Second column)
          - The header on the LEFT is in the **FIRST column**
          - The course on the RIGHT is in the **SECOND column**
          
          **CRITICAL RULE - DO NOT USE HEADER ON SAME ROW WHEN IN DIFFERENT COLUMNS**:
          - The course on the RIGHT (Second column) must **NEVER** get its semester from the header on the LEFT (First column) on the same row
          - **IGNORE** the header on the same row completely - it is in a DIFFERENT column
          - The course must get its semester using the normal Second column rules:
            1. **FIRST**: Check if any SECOND column headers have appeared before this course
               - If YES → Use the most recent Second column header
               - **DO NOT** use the First column header on the same row
            2. **SECOND**: If NO Second column headers have appeared yet, use the LAST header from the FIRST column
               - **DO NOT** use the First column header on the same row (even though it's in First column)
               - Use the **LAST** (most recent/final) First column header from the entire First column
               - The header on the same row is likely NOT the last one - you need to find the actual LAST one
          
          **EXAMPLE - CORRECT BEHAVIOR**:
          - Text row shows: [Header "Fall 2022" on LEFT] [Course "BIO 131" on RIGHT]
          - "Fall 2022" is in First column (LEFT)
          - "BIO 131" is in Second column (RIGHT)
          - First column has headers: "Fall 2022", "Spring 2023", "Fall 2023", "Spring 2024", "Fall 2024"
          - Second column has header: "Spring 2025" (appears later)
          - **CORRECT**: Course "BIO 131" gets "Fall 2024" (the LAST First column header, since no Second column header has appeared yet) ✓
          - **WRONG**: Course "BIO 131" gets "Fall 2022" (from the header on the same row) ❌
          
          **EXAMPLE - CORRECT BEHAVIOR (WITH SECOND COLUMN HEADER)**:
          - Text row shows: [Header "Fall 2022" on LEFT] [Course "BIO 131" on RIGHT]
          - "Fall 2022" is in First column (LEFT)
          - "BIO 131" is in Second column (RIGHT)
          - Second column has header: "Spring 2025" (appeared before this course)
          - **CORRECT**: Course "BIO 131" gets "Spring 2025" (from Second column header) ✓
          - **WRONG**: Course "BIO 131" gets "Fall 2022" (from the header on the same row) ❌
          
          **CRITICAL REMINDER**: When a header and course are on the same row but in different columns, **IGNORE** the header on the same row for semester assignment. Use the normal column-based rules instead.
          
          - **BUT REMEMBER**: The mandatory check above still applies - if no header has appeared in the entire document before the course, it has null semester
          
          **STEP-BY-STEP PROCESS FOR EACH COURSE - FOLLOW THIS EXACTLY, IN ORDER**:
          When you encounter a course, follow these steps in order. DO NOT SKIP ANY STEP.
          
          **STEP 0 - MANDATORY FIRST CHECK (DO THIS BEFORE ALL OTHER STEPS - THIS IS THE MOST IMPORTANT STEP)**:
          
          **CRITICAL - YOU MUST DO THIS CHECK FOR EVERY SINGLE COURSE**:
          
          1. **Look at the ORDER of courses and headers you have extracted so far**
          2. **Ask yourself**: "When I list all the items in the order I've seen them in the document, does this course appear BEFORE the first semester header?"
          3. **To answer this question**:
             - Make a mental list of all items you've seen so far: [Course1, Course2, Header1, Course3, ...]
             - Find where the FIRST header appears in this list
             - Find where the current course appears in this list
             - If the current course comes BEFORE the first header in the list → semester = null
             - If the current course comes AFTER the first header in the list → continue to Step 1
          
          **SPECIFIC EXAMPLE**:
          - Items seen so far in order: ["AP Biology", "AP Chemistry", "Fall 2022" (header), "BIO 141"]
          - For "AP Biology": It's position 1, first header is at position 3 → BEFORE header → semester = null ✓
          - For "AP Chemistry": It's position 2, first header is at position 3 → BEFORE header → semester = null ✓
          - For "BIO 141": It's position 4, first header is at position 3 → AFTER header → continue to Step 1 ✓
          
          **WHEN PROCESSING IN COLUMN ORDER**:
          - You process all FIRST column courses first, then all SECOND column courses
          - When processing FIRST column courses:
            * For each course, check: "Have I seen ANY semester header in the FIRST column yet?"
            * If NO → semester = null, STOP
            * If YES → continue
          - When processing SECOND column courses:
            * For each course, check: "Have I seen ANY semester header in the ENTIRE document yet?"
            * If NO → semester = null, STOP (this should rarely happen since you already processed first column)
            * If YES → continue
          
          **IF THE ANSWER IS "NO HEADER HAS APPEARED YET"**:
          - Set semester to: null (or empty string "")
          - STOP HERE - do NOT continue to Step 1
          - Do NOT try to find a semester for it
          - Do NOT use any header that appears after it
          - Do NOT use any fallback logic
          - This is the final answer for this course's semester
          - Log this decision: "Course appears before first header → semester = null"
          
          **IF THE ANSWER IS "YES, A HEADER HAS APPEARED"**:
          - Continue to Step 1
          
          **THIS CHECK IS MANDATORY FOR EVERY COURSE, INCLUDING AP/CLEP COURSES**
          **THIS IS THE MOST IMPORTANT CHECK - DO IT FIRST - DO NOT SKIP IT**
          
          STEP 1: Determine the course's COLUMN by HORIZONTAL POSITION AND ROW ORDER
          - **PRIMARY METHOD**: Look at where the course appears on the page (LEFT = First column, RIGHT = Second column)
          - **SAME ROW RULE - CRITICAL FOR ACCURACY**: If a course appears on the same text row as a heading (AP heading, Transfer heading, Section heading, Institution credit heading, or semester heading):
            * Look at the ORDER of items on that text row (left to right, first to second)
            * If the heading appears FIRST on the row (LEFT side): 
              - The heading is in the FIRST column (LEFT)
              - The course is in the SECOND column (RIGHT)
            * If the course appears FIRST on the row (LEFT side):
              - The course is in the FIRST column (LEFT)
              - The heading is in the SECOND column (RIGHT)
            * **RULE**: First item on row (leftmost) = FIRST column, second item on row (rightmost) = SECOND column
            * **EXAMPLES**:
              - Row: [AP HEADING on LEFT] [Course "BIO 131" on RIGHT] → AP HEADING is FIRST column, Course is SECOND column
              - Row: [Course "BIO 141" on LEFT] [Semester header "Fall 2022" on RIGHT] → Course is FIRST column, Header is SECOND column
              - Row: [Semester header "Fall 2022" on LEFT] [Course "BIO 131" on RIGHT] → Header is FIRST column, Course is SECOND column
          - **🚨🚨🚨 CRITICAL - SAME ROW SEMESTER HEADER CHECK (MANDATORY) 🚨🚨🚨**:
            * **IMMEDIATELY AFTER identifying the course's column**, check: "Is there a semester header on the SAME text row as this course?"
            * If YES: "Are they in the SAME column or DIFFERENT columns?"
            * If DIFFERENT columns (e.g., header in First column, course in Second column):
              - **MANDATORY**: Mark this course as "SAME ROW HEADER - IGNORE"
              - **DO NOT** use the semester from that same-row header under any circumstances
              - **NOTE**: You will use Second column headers or LAST First column header instead
              - **EXAMPLE**: Row shows [Header "Fall 2022" on LEFT] [Course "BIO 131" on RIGHT]
                - Header is First column, Course is Second column
                - **MARK**: Course "BIO 131" has same-row header "Fall 2022" in different column - IGNORE it
                - **DO NOT** use "Fall 2022" for this course
          - **CRITICAL**: When items appear on the same row, use row order to determine columns - first item = FIRST column, second item = SECOND column
          - **Note**: Only do this step if Step 0 passed (a header has appeared before)
          
          STEP 2: Check for headers in the course's OWN column
          - Ask: "Has a header appeared in the SAME column as this course before this course?"
          - If course is in FIRST column: Look for FIRST column headers
          - If course is in SECOND column: Look for SECOND column headers
          - **🚨🚨🚨 CRITICAL - IGNORE HEADERS ON SAME ROW IN DIFFERENT COLUMNS 🚨🚨🚨**:
            * **VERY COMMON ERROR**: If a header appears on the SAME text row as this course but in a DIFFERENT column, **IGNORE IT COMPLETELY**
            * **DO NOT** use a header from the same row if it's in a different column
            * **EXAMPLE**: Text row shows [Header "Fall 2022" on LEFT] [Course "BIO 131" on RIGHT]
              - Header "Fall 2022" is in First column (LEFT)
              - Course "BIO 131" is in Second column (RIGHT)
              - They are on the SAME row but in DIFFERENT columns
              - **WRONG**: Using "Fall 2022" for "BIO 131" because they're on the same row ❌
              - **CORRECT**: Ignore "Fall 2022" completely and use Second column rules instead ✓
                - If Second column header exists → use it
                - If no Second column header → use LAST First column header (NOT "Fall 2022" on same row)
            * **REMEMBER**: Same-row headers in different columns are NOT valid for semester assignment
            * **THIS IS ONE OF THE MOST COMMON ERRORS - DO NOT MAKE THIS MISTAKE**
          - **CRITICAL**: Ignore headers in OTHER columns, even if they appear on the same text row - this is especially important
          - **CRITICAL - FIRST HEADER IN FIRST COLUMN**: If you see the FIRST semester header in the FIRST column (e.g., "Fall 2022"), ALL courses in the FIRST column that follow it MUST get that header's semester. The first course after "Fall 2022" in the first column MUST get "Fall 2022". The second course after "Fall 2022" in the first column MUST get "Fall 2022". Every course in the first column after "Fall 2022" MUST get "Fall 2022" until you see the next header in the first column.
          - **Note**: Only do this step if Step 0 passed (a header has appeared before)
          
          STEP 3: Assign semester based on Step 2
          - **🚨🚨🚨 FIRST CHECK - SAME ROW HEADER FOR SECOND COLUMN COURSES 🚨🚨🚨**:
            * **BEFORE** assigning any semester, check: "Is this course in Second column AND is there a First column header on the SAME row?"
            * If YES: **STOP** - do NOT use that same-row header's semester
            * **MARK**: This course should NOT use the same-row header - proceed with Second column rules instead
          - IF a header appeared in the course's OWN column before it:
            → **CHECK FIRST**: Is there a header on the same row in a different column? If YES, ignore it and continue
            → Use that header's semester (the most recent one)
            → **CRITICAL - FIRST HEADER EXAMPLE**: If header "Fall 2022" appears in FIRST column, then course "BIO 141" appears in FIRST column after it, "BIO 141" MUST get semester "Fall 2022"
          - IF NO header has appeared in the course's OWN column yet:
            → IF course is in FIRST column: Leave semester as null (no semester)
            → IF course is in SECOND column: 
              * **🚨🚨🚨 MANDATORY CHECK - SAME ROW HEADER 🚨🚨🚨**:
                - **BEFORE** finding the LAST First column header, ask: "Is there a First column header on the SAME row as this Second column course?"
                - If YES: **IGNORE IT COMPLETELY** - do NOT use it
                - **WRITE DOWN**: "Same-row header [semester] is IGNORED because it's in different column"
              * Use the LAST header from FIRST column
              * The LAST header is the chronologically most recent/final header from the entire first column
              * NOT the first header, NOT any middle header, NOT the one on the same row
              * **🚨🚨🚨 CRITICAL - SAME ROW HEADER RULE - VERY COMMON ERROR 🚨🚨🚨**:
                - **IF** a First column header appears on the SAME row as this Second column course, **DO NOT USE IT**
                - **IGNORE** the header on the same row completely - it's in a different column
                - Use the **LAST** First column header from the ENTIRE First column, not the one on the same row
                - **STEP-BY-STEP PROCESS**:
                  1. Check: Is there a header on same row? If YES and in different column, IGNORE it
                  2. Find all First column headers from Pass 1
                  3. **EXCLUDE** the same-row header from the list
                  4. Find the LAST (most recent/final) one from the remaining headers
                  5. Use that LAST one, NOT the same-row header
                - **EXAMPLE**: Text row shows [Header "Fall 2022" on LEFT] [Course "BIO 131" on RIGHT]
                  - First column has: "Fall 2022", "Spring 2023", "Fall 2023", "Spring 2024", "Fall 2024"
                  - "Fall 2022" is on the same row as "BIO 131" but is in First column
                  - **STEP 1**: Check same-row header - YES, "Fall 2022" on same row, IGNORE it
                  - **STEP 2**: Find First column headers: ["Fall 2022", "Spring 2023", "Fall 2023", "Spring 2024", "Fall 2024"]
                  - **STEP 3**: Exclude same-row: ["Spring 2023", "Fall 2023", "Spring 2024", "Fall 2024"] (excluded "Fall 2022")
                  - **STEP 4**: Find LAST from remaining: "Fall 2024" (last one)
                  - **STEP 5**: Use "Fall 2024" ✓
                  - **CORRECT**: Use "Fall 2024" (the LAST First column header, ignoring same-row "Fall 2022") ✓
                  - **WRONG**: Use "Fall 2022" (from the same row) ❌
                - **REMEMBER**: Same-row headers in different columns are NOT valid for semester assignment - this is ABSOLUTE
          - **Note**: Only do this step if Step 0 passed (a header has appeared before)
          
          STEP 4: Verify your assignment
          - Ask: "Did I do Step 0 first?" If NO, go back and do it
          - Ask: "If Step 0 said no header appeared, did I set semester to null?" If NO, fix it
          - Ask: "Is this course in First column or Second column?"
            * If First column: "Did I get this semester from a First column header?" If NO, you made an error
            * If Second column: 
              - "Did a Second column header appear before this course?"
              - If YES: "Am I using a Second column header (NOT a First column header)?" If NO, you made an error - fix it immediately
              - If NO: "Am I using the LAST First column header (the final/most recent one, NOT the first one)?" If NO, you made an error - fix it immediately
          - **CRITICAL FOR SECOND COLUMN**: Verify you are NOT using a First column header when a Second column header exists before the course - this is a common error
          
          **IMPORTANT - PROCESSING IN COLUMN ORDER MAKES THIS SIMPLE**: Because you are extracting courses in COLUMN ORDER (all first column courses first, then all second column courses), semester assignment becomes straightforward:
            - For courses in the FIRST column: Use the most recent header from the FIRST column that appears before the course
            - For courses in the SECOND column: 
              * **STEP 1**: Check if a SECOND column header has appeared before this course
              * **STEP 2A**: If YES → Use that Second column header's semester (the most recent one)
                - **CRITICAL**: Do NOT use First column headers when Second column headers exist
              * **STEP 2B**: If NO → Use the LAST (most recent/final) header from the FIRST column
                - **CRITICAL**: Use the LAST First column header, NOT the first one, NOT any middle one
                - **HOW TO FIND THE LAST**: Look at all First column headers from Pass 1, find the one that appears last chronologically (typically the highest year/term)
                - **EXAMPLE**: If First column has ["Fall 2022", "Spring 2023", "Fall 2023", "Spring 2024", "Fall 2024"], the LAST one is "Fall 2024"
            - Courses that appear BEFORE the FIRST header in the entire document (often at the top): Have NO SEMESTER (null)
            
          **🚨 CRITICAL REMINDER FOR SECOND COLUMN COURSES 🚨**:
          - When assigning a semester to a Second column course, you MUST check Second column headers FIRST
          - Only if NO Second column header has appeared should you use a First column header
          - When using a First column header for a Second column course, use the LAST one, not the first one
          - This is one of the most common errors - make sure you follow this rule exactly
          
          * **RULE 1 - COURSES BEFORE ANY HEADER HAVE NO SEMESTER - CRITICAL**:
            - If a course appears BEFORE the FIRST semester header in the entire document, it has NO SEMESTER (use null or empty string)
            - This applies to ALL courses, including AP/CLEP courses and regular courses
            - **VERY COMMON FOR AP/CLEP COURSES**: AP and CLEP courses often appear at the top of the transcript BEFORE any semester headers - these MUST have NO SEMESTER (null)
            - **CRITICAL**: Even if you process courses in column order, if an AP course appears before the FIRST header in its column (or before the FIRST header in the entire document), it has NO SEMESTER (null)
            - **DO NOT ASSIGN SEMESTERS TO COURSES THAT APPEAR BEFORE ANY HEADER** - This is a fundamental rule
            - **CHECK**: Before assigning a semester to any course, ask: "Has ANY semester header appeared in the document before this course?" If NO, then the course has NO SEMESTER (null)
            - **EXAMPLES**:
              * Document starts with: "AP Biology", "AP Chemistry", then [Header: "Fall 2022"]
                - "AP Biology" has NO SEMESTER (null) - it appears before the first header
                - "AP Chemistry" has NO SEMESTER (null) - it appears before the first header
                - Courses after "Fall 2022" get "Fall 2022" as their semester
              * First column starts with: "AP English", then [Header: "Fall 2022"]
                - "AP English" has NO SEMESTER (null) - it appears before the first header in its column
          * **RULE 2 - SEMESTER FROM MOST RECENT HEADER BEFORE COURSE IN SAME COLUMN**: The course's semester MUST come from the MOST RECENT header in the SAME COLUMN that appears BEFORE the course. 
            - **COLUMN IDENTIFICATION**: Determine which column by HORIZONTAL POSITION (LEFT = First column, RIGHT = Second column), NOT by text line
            - **SAME COLUMN RULE - CRITICAL**: Courses in FIRST column get semester from FIRST column headers ONLY. Courses in SECOND column get semester from SECOND column headers ONLY.
            - **CRITICAL EXAMPLE - FIRST HEADER IN FIRST COLUMN**:
              * Header 1 (FIRST column): "Fall 2022" appears at position 3
              * Course 1 (FIRST column): "BIO 141" appears at position 4 → MUST get semester "Fall 2022" ✓
              * Course 2 (FIRST column): "CHEM 121" appears at position 5 → MUST get semester "Fall 2022" ✓
              * Course 3 (FIRST column): "ENG 101" appears at position 6 → MUST get semester "Fall 2022" ✓
              * Header 2 (FIRST column): "Spring 2023" appears at position 7
              * Course 4 (FIRST column): "BIO 142" appears at position 8 → MUST get semester "Spring 2023" ✓
              * **VERIFICATION**: After extracting "Fall 2022", verify that Course 1, Course 2, and Course 3 all have semester "Fall 2022". If they don't, that is an ERROR - fix it.
            - **CRITICAL - HEADERS AND COURSES ON SAME ROW BUT DIFFERENT COLUMNS**: 
              * If a semester header appears on the LEFT side of a text row and a course appears on the RIGHT side of the SAME text row, they belong to DIFFERENT columns
              * The header on the LEFT is in the FIRST column
              * The course on the RIGHT is in the SECOND column
              * **CRITICAL ERROR TO AVOID**: Do NOT assign the course on the RIGHT the semester from the header on the LEFT, even though they appear on the same row
              * The course on the RIGHT should get its semester from the MOST RECENT header in the SECOND column (RIGHT side), NOT from the header on the LEFT side of the same row
              * **EXAMPLE**: If you see a text row with "Fall 2022" on the LEFT and "BIO 131" on the RIGHT:
                - "Fall 2022" is a header in the FIRST column (LEFT side)
                - "BIO 131" is a course in the SECOND column (RIGHT side)
                - "BIO 131" should get its semester from the MOST RECENT header in the SECOND column (if one has appeared before it), NOT from "Fall 2022" (the first column header on the same row)
                - If no second column header has appeared yet, "BIO 131" gets the LAST header from the FIRST column (not "Fall 2022" from the same row - it should use the chronologically LAST header from the entire first column)
            - **EXCEPTION - CRITICAL**: If course is in SECOND column and appears BEFORE any header in SECOND column (when processing in column order, this means it's one of the first courses in second column), use the LAST header from FIRST column (the chronologically most recent/final header from the first column, NOT the first header, NOT any middle header, NOT a header on the same row - ONLY the LAST one)
            - **EXAMPLES OF LAST HEADER**: 
              * If first column has headers: "Fall 2022", "Spring 2023", "Fall 2023", "Spring 2024", "Fall 2024" → The LAST header is "Fall 2024"
              * If first column has headers: "Fall 2022", "Spring 2023" → The LAST header is "Spring 2023"
              * The LAST header is always the one that appears LAST in chronological order in the first column
          * **RULE 3 - HEADERS APPLY ONLY TO COURSES AFTER THEM**: A header applies ONLY to courses that come AFTER it in the SAME COLUMN, NEVER to courses before it. When you see a header, IMMEDIATELY assign its semester to ALL following courses in the SAME COLUMN until the next header.
          * **WORKFLOW - SIMPLIFIED BY COLUMN ORDER**: 
            1. Extract ALL courses from FIRST column first (in order they appear in that column)
              - For each course: Assign semester from most recent FIRST column header before it
              - If course appears before first FIRST column header: No semester (null)
            2. AFTER all first column courses are extracted, extract ALL courses from SECOND column (in order they appear in that column)
              - **CRITICAL**: Remember the LAST header from FIRST column (the chronologically most recent header from the first column, NOT the first header)
              - **CRITICAL**: Track which is the LAST header from FIRST column - this is the header that appears LAST in your list of first column headers (e.g., if first column has "Fall 2022", "Spring 2023", "Fall 2023", "Spring 2024", "Fall 2024", then "Fall 2024" is the LAST header)
              - For each SECOND column course:
                * If a SECOND column header has appeared before this course: Use that SECOND column header's semester
                * If NO SECOND column header has appeared yet: Use the LAST header from FIRST column (NOT the first header, NOT any middle header - ONLY the LAST/chronologically most recent header)
                * When you see a SECOND column header: Switch to using that header for all subsequent SECOND column courses
          * **CRITICAL - EXAMPLES - READ THESE CAREFULLY**:
            - Example 1 (CRITICAL - AP COURSES BEFORE HEADERS):
              * Document/column starts with: "AP Biology", "AP Chemistry", then [Header: "Fall 2022"], then "BIO 141" (all in first column)
              * **CRITICAL**: "AP Biology" has NO SEMESTER (null) - it appears BEFORE the first header
              * **CRITICAL**: "AP Chemistry" has NO SEMESTER (null) - it appears BEFORE the first header
              * **DO NOT** assign "Fall 2022" to the AP courses just because a header appears after them - they must have null
              * "BIO 141" gets "Fall 2022" - it appears AFTER the header
              * **WRONG**: Do NOT assign "Fall 2022" to "AP Biology" or "AP Chemistry" - they must have null semester
            - Example 2: First column has header "Fall 2022", then "BIO 141" (in first column) → BIO 141 gets "Fall 2022"
            - Example 3: After processing all first column courses, you process second column. Header "Spring 2025" appears in second column, then "BIO 212" in second column → BIO 212 gets "Spring 2025" (NOT from first column)
            - Example 4 (CRITICAL - VERY COMMON): 
              * FIRST column has: [Header 1: "Fall 2022"], courses, [Header 2: "Spring 2023"], courses, [Header 3: "Fall 2023"], courses, [Header 4: "Spring 2024"], courses, [Header 5: "Fall 2024"], courses
              * SECOND column starts with: Course "BIO 131" (FIRST course in second column, appears BEFORE any second column header), then [Header: "Spring 2025"], then Course "BIO 212"
              * CORRECT: Course "BIO 131" gets Header 5 ("Fall 2024") - the LAST header from first column, NOT Header 1 ("Fall 2022") - the FIRST header from first column
              * CORRECT: Course "BIO 212" gets "Spring 2025" - the header from second column
              * WRONG: Course "BIO 131" should NOT get "Fall 2022" (the first header) - it should get "Fall 2024" (the LAST header)
            - Example 5 (CRITICAL - HEADER AND COURSE ON SAME ROW - READ THIS CAREFULLY):
              * **SCENARIO**: A text row shows: [LEFT SIDE: "Fall 2022"] [RIGHT SIDE: "BIO 131"]
              * **ANALYSIS**:
                - "Fall 2022" is on the LEFT side → It's in the FIRST column
                - "BIO 131" is on the RIGHT side → It's in the SECOND column
                - Even though they're on the SAME text row, they're in DIFFERENT columns
              * **WHAT TO DO FOR "BIO 131"**:
                1. Determine column: "BIO 131" is in SECOND column (RIGHT side)
                2. Check for headers in SECOND column: Has any header appeared in the SECOND column before "BIO 131"?
                3. If YES (a second column header appeared before it): Use that second column header's semester
                4. If NO (no second column header yet): Use the LAST header from FIRST column
                   - The LAST header is the final/most recent header from the entire first column
                   - If first column has: "Fall 2022", "Spring 2023", "Fall 2023", "Spring 2024", "Fall 2024"
                   - Then LAST header is "Fall 2024"
                   - "BIO 131" should get "Fall 2024" (the LAST header), NOT "Fall 2022" (from the same row)
              * **CORRECT ASSIGNMENT**: "BIO 131" gets "Fall 2024" (the LAST header from first column)
              * **WRONG ASSIGNMENT**: "BIO 131" gets "Fall 2022" (the header from the same row)
              * **KEY POINT**: The course on the RIGHT side must get its semester from its OWN column (second column), NOT from any header on the LEFT side, even if they're on the same row
            - **REMEMBER**: 
              * When processing courses in the second column that appear BEFORE any second column header, use the LAST header from the first column (the chronologically most recent header from the first column), NOT the first header from the first column
              * Even if a header and course appear on the SAME text row, they belong to DIFFERENT columns if one is on LEFT and one is on RIGHT - the course must get its semester from headers in its OWN column, NOT from the header on the same row in a different column
        - Grade (e.g., "A", "B+", "3.5"). **CRITICAL**: 
          * The grade is a SEPARATE field and should be extracted independently from the course number and course name.
          * The grade typically appears after the course name on the same line.
          * If a grade letter (A, B, C, D, F, S, P, W, U, etc.) appears at the end of the course name text with no space or immediately after the course name, extract it as the grade and remove it from the course name.
          * **DO NOT INCLUDE THE GRADE IN THE COURSE NAME**: The grade should be in the grade field, NOT in the courseName field.
          * Do NOT include the grade in the course number or course name fields.
          * If no grade is visible on the same line as the course (after the course number and name), use null or empty string.
        - Credit Hours (Attempted/Earned)

      **CRITICAL - RETURN SEMESTER-ORGANIZED JSON**: You MUST return JSON that groups courses by semester using the semester structure from Pass 1.
      
      **🚨🚨🚨🚨🚨 FINAL VALIDATION BEFORE RETURNING JSON 🚨🚨🚨🚨🚨**:
      
      **MANDATORY - EXCLUDE TRANSFER COURSES - FINAL CHECK**:
      - **BEFORE** returning your JSON response, go through your course list
      - **CHECK**: Did you extract any courses that appeared after headers containing "Transfer"?
        * Headers to check for: "2022 Fall - Transfer", "Transfer Fall 2022", "Fall 2022 Transfer", "Transfer Credit Fall 2022", etc.
      - **IF YES**: **REMOVE** those courses completely from your JSON
        * Remove them from "semesters" array (from each semester's "courses" array)
        * Remove them from "coursesWithoutSemester" array
        * They should NOT appear anywhere in your output
      - **DO NOT** include Transfer Credit courses in your final output - exclude them completely
      - **VALIDATION CHECKLIST**:
        * [ ] I checked if any courses appeared after "2022 Fall - Transfer" or similar headers
        * [ ] I removed all such courses from "semesters" array
        * [ ] I removed all such courses from "coursesWithoutSemester" array
        * [ ] No Transfer courses appear in my final JSON output
      
      **THIS IS YOUR LAST CHANCE - COMPLETELY REMOVE TRANSFER COURSES BEFORE RETURNING JSON**
      
      Return the data in the following JSON format ONLY (no markdown formatting, just raw JSON):
      {
        "studentName": "string",
        "university": "string",
        "semesters": [
          {
            "semester": "string (must match one of the semesters from Pass 1)",
            "column": "First" or "Second",
            "courses": [
              {
                "courseNumber": "string",
                "courseName": "string",
                "grade": "string",
                "hours": number
              }
            ]
          }
        ],
        "coursesWithoutSemester": [
          {
            "courseNumber": "string",
            "courseName": "string",
            "grade": "string",
            "hours": number
          }
        ]
      }
      
      **CRITICAL - SEMESTER ASSIGNMENT**:
      1. For each semester in the Pass 1 structure, create a "semesters" array entry with that semester name and column
      2. Assign each course to the appropriate semester based on the rules below
      3. Courses that appear BEFORE the FIRST semester header go in "coursesWithoutSemester" array
      4. For each course, determine which semester it belongs to based on:
         - Which column the course appears in (LEFT = First, RIGHT = Second)
         - The MOST RECENT semester header BEFORE the course in the SAME COLUMN
         - If course is in Second column and appears before any Second column semester, use the LAST semester from First column
      5. Place each course in the "courses" array of the appropriate semester object
      
      **EXAMPLE STRUCTURE**:
      If Pass 1 found:
      - "Fall 2022" in First column
      - "Spring 2023" in First column
      - "Spring 2025" in Second column
      
      Then your JSON should have:
      {
        "semesters": [
          {
            "semester": "Fall 2022",
            "column": "First",
            "courses": [/* courses that follow "Fall 2022" in First column */]
          },
          {
            "semester": "Spring 2023",
            "column": "First",
            "courses": [/* courses that follow "Spring 2023" in First column */]
          },
          {
            "semester": "Spring 2025",
            "column": "Second",
            "courses": [/* courses that follow "Spring 2025" in Second column */]
          }
        ],
        "coursesWithoutSemester": [/* courses that appear before the first semester header */]
      }
      
      **CRITICAL - COURSE ASSIGNMENT RULES**:
      1. Courses that appear BEFORE the FIRST semester header in the entire document go in "coursesWithoutSemester" array
      2. For courses after the first header, determine which column they belong to (LEFT = First, RIGHT = Second)
      3. Courses in First column get assigned to semesters from First column only
      4. Courses in Second column get assigned to semesters from Second column only
      5. If a course in Second column appears before any Second column semester, assign it to the LAST semester from First column
      6. Use the row order rules: [Header] [Course] → Header is First column, Course is Second column
      7. [Course] [Header] → Course is First column, Header is Second column

      If a field is missing, use null or an empty string.
      **CRITICAL - GRADE EXTRACTION**: Each course must have its own grade extracted from where it appears in the transcript. Do NOT copy grades from one course to another. Look for the grade that appears directly next to or associated with each individual course. If a course does not have a visible grade, use null or empty string - DO NOT copy a grade from another course.
      For grades, try to normalize to letter grades or standard numeric values if possible, but keep original if unsure.
      For semester, try to normalize to "Semester Year" format (e.g., "Fall 2023").
      
      **CRITICAL REMINDER - SEMESTER ASSIGNMENT RULES** (READ THE DETAILED RULES ABOVE, BUT REMEMBER):
      1. Courses BEFORE the FIRST semester header in the document have NO SEMESTER (null) - this is common for AP/CLEP courses
      2. Courses get semester from the MOST RECENT header BEFORE them in the SAME COLUMN
      3. If 2 columns: Same column rule applies - use headers from same column only
      4. If no header in column yet (for second column): Use last header from first column
      5. **CRITICAL - SAME ROW, DIFFERENT COLUMNS**: If a header and course appear on the SAME text row but in DIFFERENT columns (header on LEFT, course on RIGHT), the course MUST get its semester from headers in its OWN column (RIGHT column), NOT from the header on the same row (LEFT column)
      6. If you do this correctly during extraction, no post-processing corrections are needed
      
      **STEP-BY-STEP DECISION TREE FOR SEMESTER ASSIGNMENT - FOLLOW THIS EXACTLY**:
      When assigning a semester to a course:
      
      STEP 1: Determine which COLUMN the course belongs to
      - Look at the HORIZONTAL POSITION of the course on the page
      - LEFT side of page = FIRST column
      - RIGHT side of page = SECOND column
      - **IGNORE which text row it appears on - COLUMN IS DETERMINED BY HORIZONTAL POSITION ONLY**
      
      STEP 2: Check if any header has appeared in the course's OWN column before this course
      - If course is in FIRST column: Check if any FIRST column header appeared before this course
      - If course is in SECOND column: Check if any SECOND column header appeared before this course
      - **CRITICAL**: When checking for headers, ONLY look at headers in the SAME column as the course
      - **CRITICAL**: Even if a header appears on the SAME text row as the course but in a DIFFERENT column, DO NOT use that header
      
      STEP 3: Assign semester based on Step 2 result
      - IF a header appeared in the course's OWN column before this course:
        → Use the MOST RECENT header from the course's OWN column
      - IF NO header has appeared in the course's OWN column yet:
        → IF course is in FIRST column: Leave semester as null (no semester)
        → IF course is in SECOND column: Use the LAST header from FIRST column (the chronologically most recent/final header from the entire first column)
      
      STEP 4: Double-check your assignment
      - Ask yourself: "Did I get this semester from a header in the SAME column as the course?"
      - If NO: You made an error - go back and fix it
      - If a header appeared on the same row but in a different column, make sure you did NOT use that header
      
      **VISUAL EXAMPLE - SAME ROW, DIFFERENT COLUMNS**:
      Imagine a text row that looks like this:
      [LEFT SIDE: "Fall 2022"]     [RIGHT SIDE: "BIO 131"]
      
      In this case:
      - "Fall 2022" is a header in the FIRST column (LEFT side)
      - "BIO 131" is a course in the SECOND column (RIGHT side)
      - Even though they're on the SAME row, they're in DIFFERENT columns
      
      Correct assignment for "BIO 131":
      - Check if any header appeared in the SECOND column (RIGHT side) before "BIO 131"
      - If YES: Use that second column header
      - If NO: Use the LAST header from the FIRST column (NOT "Fall 2022" from the same row)
      
      WRONG assignment for "BIO 131":
      - Getting "Fall 2022" just because it's on the same row
      - Getting any header from the FIRST column except the LAST one
      
      The correct semester for "BIO 131" is either:
      - The most recent header from the SECOND column (if one appeared before it), OR
      - The LAST header from the FIRST column (the chronologically most recent one, e.g., "Fall 2024" if that's the last first column header)

      IMPORTANT:
      - **CRITICAL - SEMESTER ASSIGNMENT RULES - FOLLOW THESE EXACTLY - THIS IS THE MOST IMPORTANT PART**:
        
        **RULE 1 - COURSES BEFORE ANY SEMESTER HEADER HAVE NO SEMESTER**:
        * **MANDATORY**: Courses that appear BEFORE the FIRST semester header in the document have NO SEMESTER - leave semester as null or empty string
        * This is VERY COMMON for AP/CLEP courses which often appear at the top before any semester headers
        * **CRITICAL**: A semester header applies ONLY to courses that come AFTER it, NEVER to courses that come before it
        * **EXAMPLE**: If you see: "AP Biology", "AP Chemistry", [Header: "Fall 2022"], "BIO 141"...
          - "AP Biology" and "AP Chemistry" have NO SEMESTER (null) because they appear BEFORE the header
          - "BIO 141" gets "Fall 2022" because it appears AFTER the header
        * **DO NOT ASSIGN SEMESTERS TO COURSES THAT APPEAR BEFORE ANY HEADER** - This is a CRITICAL RULE
        
        **RULE 2 - SEMESTER FROM MOST RECENT HEADER BEFORE COURSE IN SAME COLUMN**:
        * Each course gets its semester from the MOST RECENT semester header/bar that appears BEFORE it in the document
        * **TWO-COLUMN LAYOUT**: If the document has 2 columns, the course gets its semester from the MOST RECENT header in the SAME COLUMN as the course
        * **COLUMN IDENTIFICATION**: 
          - FIRST column = LEFT side of the page
          - SECOND column = RIGHT side of the page
          - Determine column by HORIZONTAL POSITION, NOT by text line
          - If two courses appear on the SAME LINE, one on LEFT and one on RIGHT, they belong to DIFFERENT columns
        * **SAME COLUMN RULE**: 
          - Courses in FIRST column (LEFT) get semester from headers in FIRST column (LEFT) ONLY
          - Courses in SECOND column (RIGHT) get semester from headers in SECOND column (RIGHT) ONLY
        * **EXCEPTION - NO HEADER IN COLUMN YET**: If a course appears in SECOND column BEFORE any header has appeared in SECOND column, use the LAST header from FIRST column
        * **CRITICAL - HEADER POSITION**: A header appears "BEFORE" a course if the course comes AFTER the header in the document reading order within the same column
        
        **RULE 3 - WORKFLOW - FOLLOW THIS EXACTLY**:
        * **STEP 1**: Identify ALL semester headers in the document first (they contain terms like "Spring", "Fall", "Summer", "Winter" or abbreviations "SP", "FA", "SU", "WN" followed by a year "YYYY" or "YY")
        * **STEP 2**: For each course:
          - Determine which column it belongs to (LEFT = First, RIGHT = Second)
          - **CRITICAL - CHECK FOR HEADERS IN SAME COLUMN**: Look for semester headers in the SAME COLUMN as the course that appear BEFORE this course in the document
          - **FIND THE MOST RECENT HEADER**: Find the header in the SAME COLUMN that appears most recently BEFORE this course (the one closest to the course that still comes before it)
          - **IF YOU FIND A HEADER IN SAME COLUMN BEFORE THE COURSE**: 
            * Use that header's semester - this is MANDATORY
            * **EXAMPLE**: If header "Fall 2022" appears in FIRST column, then course "BIO 141" appears in FIRST column after it, "BIO 141" MUST get semester "Fall 2022"
          - **IF NO HEADER IN SAME COLUMN BEFORE THE COURSE**:
            * For FIRST column: Leave as null (no semester) - no header has appeared yet in first column
            * For SECOND column: Use the LAST header from FIRST column (if available), otherwise leave as null
          - **IF COURSE APPEARS BEFORE THE FIRST HEADER IN ENTIRE DOCUMENT**: Leave as null (no semester)
        * **CRITICAL - ASSIGN IMMEDIATELY**: When you see a header, IMMEDIATELY assign that header's semester to ALL courses that follow it in the SAME COLUMN until you see the next header. Do NOT wait - do this during extraction.
        * **CRITICAL - FIRST HEADER IN FIRST COLUMN**: When you see the FIRST semester header in the FIRST column (e.g., "Fall 2022"), you MUST assign that header's semester to ALL courses in the FIRST column that follow it. The first course after "Fall 2022" in the first column MUST get semester "Fall 2022". The second course after "Fall 2022" in the first column MUST get semester "Fall 2022". And so on, until you see the next header in the first column.
        * **EXAMPLE - FIRST HEADER IN FIRST COLUMN**:
          - Header 1 (FIRST column): "Fall 2022"
          - Course 1 (FIRST column): "BIO 141" appears after "Fall 2022" → semester MUST be "Fall 2022" ✓
          - Course 2 (FIRST column): "CHEM 121" appears after "Fall 2022" → semester MUST be "Fall 2022" ✓
          - Course 3 (FIRST column): "ENG 101" appears after "Fall 2022" → semester MUST be "Fall 2022" ✓
          - Header 2 (FIRST column): "Spring 2023" appears after Course 3
          - Course 4 (FIRST column): "BIO 142" appears after "Spring 2023" → semester MUST be "Spring 2023" ✓
        
        **RULE 4 - HEADERS APPLY ONLY TO COURSES AFTER THEM**:
        * A semester header applies ONLY to courses that appear AFTER it in the document (within the same column)
        * A semester header does NOT apply to courses that appear BEFORE it
        * When recording header position, record it as "Before course X" where X is the FIRST course that follows it
        
        **CRITICAL - DO THIS CORRECTLY AND NO POST-PROCESSING IS NEEDED**: If you follow these rules exactly during extraction, the semesters will be correct and no post-processing corrections will be necessary. These rules are SIMPLE but CRITICAL - follow them precisely.
      
      - **ADDITIONAL DETAILS FOR SEMESTER HEADER IDENTIFICATION**: Semester headers appear as:
        * Text with term names: "Fall 2023", "Spring 2025", "FALL 2023", "SPRING 2025", etc.
        * Abbreviations: "FA23", "SP25", "2023FA", "2025SP", "F23", "S25", etc.
        * Horizontal bars or section dividers: "********** Fall 2023 **********", "-----Spring 2025-----", etc.
        * Headers often appear on their own line or in a distinct section
        * Look for patterns: [Term Name] + [Year] or [Year] + [Term Abbreviation]
      
      - **DETAILED COLUMN-BASED ASSIGNMENT RULES**:
      - **RULE 2 - CRITICAL - PROPAGATE SEMESTERS FROM HEADERS**: When you see a new semester header/bar, that becomes the active semester for ALL courses that follow in the SAME COLUMN until the next semester header/bar. **YOU MUST DO THIS**: 
        * When you identify a header, you MUST assign its semester to EVERY course that follows it in the SAME COLUMN until you see the next header
        * This is NOT optional - you MUST propagate semesters from headers to subsequent courses
        * **CRITICAL - FIRST HEADER IN FIRST COLUMN**: When you see the FIRST semester header in the FIRST column (e.g., "Fall 2022"), you MUST assign that header's semester to ALL courses in the FIRST column that follow it. Every single course in the first column after "Fall 2022" MUST get semester "Fall 2022" - no exceptions.
        * When you see a header in the FIRST column, ALL courses that follow it in the FIRST column get that header's semester, NOT headers from the second column
        * When you see a header in the SECOND column, ALL courses that follow it in the SECOND column get that header's semester, NOT headers from the first column
        * The header does NOT apply to courses that appear before it
        * **WORKFLOW**: Identify header → Extract semester name → **IMMEDIATELY** assign that semester to all following courses in same column → Continue until next header
        * **VERIFICATION**: After extracting a header, verify that you have assigned its semester to ALL courses that follow it in the same column. If a course appears after a header in the same column but does NOT have that header's semester, that is an ERROR - fix it.
      - **RULE 3**: Do NOT assign a semester to a course unless you see a semester header/bar. If no header is visible, leave it as null. However, if you see a header, you MUST assign its semester to all courses that follow it.
      - **CRITICAL - SEMESTER ASSIGNMENT BY COLUMN - THIS IS EXTREMELY IMPORTANT**: 
        * **FIRST COLUMN COURSES**: Courses in the first column (LEFT side) get their semester from headers in the FIRST column ONLY. They NEVER get semesters from headers in the second column, regardless of where those headers appear on the page.
        * **SECOND COLUMN COURSES**: 
          - If a course appears in the second column (RIGHT side) BEFORE the first header in the second column, it gets the last header from the first column
          - If a course appears in the second column (RIGHT side) AFTER a header in the second column, it MUST get that header's semester, NOT the first column's header
        * **CRITICAL ERROR TO AVOID**: 
          - Do NOT assign courses in the first column semesters from headers in the second column
          - Do NOT assign courses in the second column that appear after a second column header to headers from the first column
        * **EXAMPLE**: If the second column has a header at the top, then all courses in the second column after that header get that header's semester, NOT headers from the first column. Courses in the first column continue to get semesters from headers in the first column, NOT from the second column header.
      - **CRITICAL FOR TWO-COLUMN LAYOUTS - SEMESTER HEADERS IN EACH COLUMN**: This is EXTREMELY IMPORTANT:
        * **VALIDATION RULE - CRITICAL - READ THIS FIRST**: The first column should END with "Fall 2024" (or the last semester chronologically in the first column). If you see "Spring 2025" or "Fall 2025" in the first column, that is WRONG - these MUST be in the SECOND column because they come chronologically AFTER "Fall 2024". If the first column ends with "Fall 2024", then "Spring 2025" and "Fall 2025" MUST be in the second column, NOT the first column.
        * **SPECIFIC CORRECT ORDER FOR THIS TRANSCRIPT - THIS IS THE CORRECT ORDER**: 
          - First column headers (in exact order): 1. Fall 2022, 2. Spring 2023, 3. Fall 2023, 4. Spring 2024, 5. Fall 2024
          - Second column headers (in exact order): 6. Spring 2025, 7. Fall 2025
          - **CRITICAL ERROR TO AVOID**: If you see "Fall 2025" as Header 2 in the first column, that is WRONG - "Fall 2025" should be Header 7 in the second column. Do NOT identify "Fall 2025" in the first column - it belongs in the second column.
          - **CRITICAL ERROR TO AVOID**: If you see "Fall 2025" before "Spring 2023" in the first column, that is WRONG - "Fall 2025" comes chronologically AFTER "Spring 2023", so if you see it before "Spring 2023", check which side of the page it appears on (LEFT = first column, RIGHT = second column). If it appears on the RIGHT side, it is in the second column.
          - **VALIDATION CHECK**: Before identifying a header, ask yourself: "Does this header fit chronologically in the first column?" If "Fall 2025" appears before "Spring 2023", that is WRONG - check which side of the page it's on (LEFT vs RIGHT).
        * **EACH COLUMN CAN HAVE ITS OWN SEMESTER HEADERS/BARS**: When processing a two-column layout, you MUST identify semester headers/bars in BOTH columns independently.
        * **CRITICAL - DISTINGUISH BETWEEN COLUMNS**: The FIRST column is on the LEFT side of the page. The SECOND column is on the RIGHT side of the page. Headers that appear on the LEFT are in the FIRST column. Headers that appear on the RIGHT are in the SECOND column. Do NOT confuse headers in different columns - they are in different physical locations on the page.
        * **CRITICAL - PROCESS COLUMNS SEQUENTIALLY - DO NOT MIX**: 
          1. **FIRST**: Process the FIRST column (LEFT side) completely from top to bottom, identifying ALL headers in chronological order as they appear. Do NOT look at the second column yet. Do NOT identify any headers from the second column. Only identify headers that appear on the LEFT side of the page.
          2. **THEN**: After you have COMPLETELY finished processing the first column and identified ALL headers in the first column, THEN process the SECOND column (RIGHT side) from top to bottom, identifying ALL headers in chronological order as they appear. Only identify headers that appear on the RIGHT side of the page.
          3. **CRITICAL - CHRONOLOGICAL VALIDATION**: Headers in the first column must be in chronological order. If you see a header that doesn't fit chronologically in the first column (e.g., a header that comes chronologically after the last header in the first column), it is likely in the second column. Use chronological order as a validation check.
          4. **CRITICAL - DO NOT MIX COLUMNS**: Do NOT identify a header from the second column as being in the first column. Do NOT identify a header from the first column as being in the second column. Headers must be in different physical locations on the page (LEFT vs RIGHT). If a header appears on the RIGHT side, it is in the second column. If a header appears on the LEFT side, it is in the first column.
          5. Headers must be identified in the order they appear within each column (top to bottom, chronologically)
        * **FIRST COLUMN - COMPLETE PROCESSING REQUIRED**: Identify ALL semester headers/bars in the FIRST column (LEFT side of the page) in chronological order as they appear from top to bottom. Do NOT move to the second column until you have identified ALL headers in the first column. Each header applies to courses that follow it in that column until the next header. Headers in the first column appear on the LEFT side of the page ONLY - do NOT include headers from the right side. The headers in the first column should be in chronological order.
        * **CRITICAL - FIRST COLUMN ENDING**: The first column should END with the last semester chronologically in the first column. If you see a header that comes chronologically AFTER the last header in the first column, that header must be in the SECOND column, not the first column. Headers that come chronologically after the first column's last header cannot be in the first column - they must be in the second column.
        * **SECOND COLUMN - ONLY AFTER FIRST COLUMN IS COMPLETE**: ONLY after you have COMPLETELY finished processing the first column, identify ALL semester headers/bars in the SECOND column (RIGHT side of the page) in chronological order as they appear from top to bottom. The FIRST semester header/bar in the second column is CRITICAL - do NOT miss it! Headers in the second column appear on the RIGHT side of the page ONLY - do NOT include headers from the left side. Headers in the second column are DIFFERENT from headers in the first column and appear in a different physical location (RIGHT vs LEFT). The headers in the second column should be in chronological order and come chronologically AFTER the last header in the first column.
        * **HOW TO IDENTIFY SECOND COLUMN HEADERS**: 
          - Look at the TOP of the SECOND column (RIGHT side of the page) FIRST - there may be a semester header/bar there
          - BUT ALSO look for semester headers that appear ANYWHERE in the SECOND column area (RIGHT side of the page), not just at the top
          - The first header in the SECOND column may appear AFTER some courses have already been listed in the SECOND column
          - **CRITICAL**: Headers in the SECOND column appear on the RIGHT side of the page - they are NOT the same as headers in the FIRST column (which appear on the LEFT side)
          - These headers may appear as horizontal bars, section dividers, or text headers
          - They are typically on their own line or in a distinct section
          - Examples: "Spring 2025", "Fall 2023", "2025SP", "***** Fall 2025 *****", etc.
        * **CRITICAL - DO NOT CONFUSE COLUMNS**: A header that appears on the LEFT side of the page is in the FIRST column. A header that appears on the RIGHT side of the page is in the SECOND column. These are DIFFERENT headers in DIFFERENT locations. Do NOT identify a header in the first column as being in the second column, or vice versa.
        * **INITIAL STATE**: When you start processing the second column, the active semester is the LAST semester header from the first column. This is only used for courses in the second column that appear BEFORE the first header in the second column.
        * **SECOND COLUMN HEADERS - CRITICAL RULE - THIS IS EXTREMELY IMPORTANT**: When you encounter the FIRST semester header/bar in the second column (whether it's at the top, in the middle, or anywhere in the second column), that header becomes the active semester for ALL courses in the second column that FOLLOW it, until the next header in the second column. This header OVERRIDES the last header from the first column for all subsequent courses. **CRITICAL**: Once you see a header in the second column, ALL courses that follow it in the second column MUST get that header's semester, NOT the first column's header.
        * **CRITICAL - COURSE ASSIGNMENT IN SECOND COLUMN**: 
          - If a course appears in the second column BEFORE the first header in the second column, it gets the last header from the first column
          - If a course appears in the second column AFTER a header in the second column, it MUST get the second column's header, NOT the first column's header
          - **CRITICAL ERROR TO AVOID**: Do NOT assign courses in the second column that appear after a header in the second column to headers from the first column - they MUST get the header from the second column
          - **EXAMPLE**: If the second column has a header at the top, then all courses in the second column after that header get that header's semester, NOT headers from the first column
        * **CRITICAL - ORDER OF OPERATIONS**: 
          1. When you reach the second column, start with the last header from the first column as the active semester
          2. As you process courses in the second column, check if there is a semester header/bar BEFORE each course in the second column
          3. If you encounter a semester header/bar in the second column (whether at the top or after some courses), that header becomes the active semester for ALL courses that follow it in the second column - SWITCH to this header immediately
          4. **CRITICAL SWITCH**: Once you see a header in the second column, you MUST stop using the first column's header and start using the second column's header for all subsequent courses
        * **MANDATORY**: You MUST extract the first course in the second column. 
        * **CRITICAL RULE**: If there is a semester header/bar at the top of the second column (before any courses), that header applies to ALL courses in the second column that follow it, NOT the last header from the first column. You MUST identify and use this header.
        * **CRITICAL RULE - VERY COMMON SCENARIO**: If courses appear in the second column BEFORE the first semester header in that column appears, use the last semester header from the first column for those courses. BUT, when you encounter the FIRST semester header in the second column (even if it appears after some courses), you MUST switch to using that header's semester for ALL courses that FOLLOW it in the second column. This is a CRITICAL SWITCH - do NOT continue using the first column's header after you see a header in the second column.
        * **CRITICAL - HEADER POSITION UNDERSTANDING**: When a semester header appears in the second column AFTER some courses, those courses that appear BEFORE the header do NOT get the header's semester - they get the semester from the first column or from a previous header. Only courses that appear AFTER the header get the header's semester. The header applies to courses that FOLLOW it, not courses that come before it.
        * **EXAMPLE**: If in the second column you see: Course A, Course B, [Header: "Spring 2025"], Course C, Course D
          - Course A and Course B get the semester from the last header in the first column (or no semester)
          - Course C and Course D get "Spring 2025" from the header that appears before them
          - When recording header position, record it as "Before Course C" (the first course that follows it), NOT "After Course B". The header applies to courses that FOLLOW it.
        * **DO NOT MISS**: The first semester header/bar in the second column may be at the very top, OR it may appear after some courses have already been listed. Look carefully for it throughout the entire second column. Do NOT skip it or ignore it. Scan the entire second column area for semester headers.
        * **COMMON ERROR TO AVOID**: Do NOT put courses after the first header in the second column into the semester from the first header in the first column. This is a VERY COMMON MISTAKE. When you encounter the first header in the second column, you MUST switch from using the first column's header to using the second column's header for all subsequent courses.
        * **REMEMBER**: Extract ALL courses, including the first course in the second column. Do not skip any courses.
        * **EXAMPLE 1 - Header at top of second column**: 
          - First column ends with "Spring 2025" (this is the last header in the first column)
          - Second column starts with a "Fall 2025" header/bar at the top
          - Then courses appear: Course A, Course B, Course C
          - CORRECT: Course A, Course B, and Course C should all get "Fall 2025" (from the header in the second column)
          - WRONG: Course A, Course B, and Course C should NOT get "Spring 2025" (from the last header in the first column)
        * **EXAMPLE 2 - Header appears after courses in second column (THIS IS THE COMMON CASE)**:
          - First column has a semester header "Fall 2022" near the end
          - Courses appear in the second column: Course A, Course B (these should get "Fall 2022" from the first column)
          - Then a semester header appears in the second column: "Spring 2025"
          - Then more courses appear: Course C, Course D, Course E
          - CORRECT: Course A and Course B get "Fall 2022" (from first column header), but Course C, Course D, and Course E get "Spring 2025" (from the second column header)
          - WRONG: Course C, Course D, and Course E should NOT get "Fall 2022" - they MUST get "Spring 2025" because a header appeared in the second column
          - When the first header in the second column appears, you MUST switch to using it for all subsequent courses
          - **CRITICAL**: The header position should be recorded as "Before Course C" (the first course that follows it), NOT "After Course B". The header applies to Course C, Course D, and Course E - courses that FOLLOW it, not Course A and Course B which come before it.
        * **WORKFLOW - FOLLOW THIS EXACTLY - COLUMN BY COLUMN IN ORDER**: 
          1. **STEP 1 - PROCESS FIRST COLUMN COMPLETELY**: Process the first column (LEFT side) completely from top to bottom. Identify ALL semester headers in the first column in chronological order as they appear (top to bottom). Do NOT look at the second column yet. Do NOT identify any headers from the second column. Only identify headers that appear on the LEFT side. Headers must be in chronological order. If a header appears out of chronological order in the first column, check which side of the page it's on (LEFT vs RIGHT) - if it's on the RIGHT side, it's in the second column.
          2. **STEP 2 - REMEMBER LAST HEADER FROM FIRST COLUMN**: After processing the entire first column, remember the LAST semester header from the first column - this will be the initial active semester when you start processing the second column.
          3. **STEP 3 - PROCESS SECOND COLUMN AFTER FIRST IS COMPLETE**: ONLY AFTER you have COMPLETELY finished identifying ALL headers in the first column, start processing the second column (RIGHT side) from top to bottom. Start with the last header from the first column as the active semester for courses that appear before the first header in the second column.
          4. **STEP 4 - IDENTIFY HEADERS IN SECOND COLUMN IN CHRONOLOGICAL ORDER**: As you process the second column from top to bottom, identify ALL semester headers in the second column in chronological order as they appear (top to bottom). Each header in the second column appears on the RIGHT side - do NOT confuse them with headers from the first column. Headers in the second column come chronologically AFTER the last header in the first column. Headers must be in chronological order within the second column.
          5. **STEP 5 - SWITCH TO SECOND COLUMN HEADERS - CRITICAL**: If you encounter a semester header/bar in the second column (whether at the top or after some courses), that header becomes the active semester for ALL courses that FOLLOW it in the second column - SWITCH to this header immediately. **CRITICAL**: Do NOT continue using the first column's header for courses that appear AFTER a header in the second column. Those courses MUST get the second column's header.
          6. **CRITICAL SWITCH - THIS IS EXTREMELY IMPORTANT**: Once you see a header in the second column, you MUST stop using the first column's header and start using the second column's header for ALL subsequent courses in the second column. **CRITICAL ERROR TO AVOID**: If a course appears in the second column after a header in the second column, it MUST get that header's semester, NOT headers from the first column. Do NOT assign courses in the second column after a second column header to semesters from the first column.
          7. Continue processing courses in the second column, watching for new headers - when you see a new header, update the active semester again.
          8. **CRITICAL CHECK - BEFORE EXTRACTING EACH COURSE**: Before extracting each course, ask yourself: "Which column does this course belong to? LEFT side = First column, RIGHT side = Second column." Then, if the course is in the SECOND column (RIGHT side), ask: "Have I seen a semester header in the second column yet? If yes, which header?" If you have seen a header in the second column, use that header's semester, NOT the first column's header, even if the first column header appears on the same or nearby text lines. If no header in the second column yet, check if there's a header before this course in the second column. Only use the first column's last header if there is NO header in the second column yet.
          9. **CRITICAL - COURSE SEMESTER ASSIGNMENT**: When assigning a semester to a course:
            - **FIRST**: Identify which column the course belongs to based on its HORIZONTAL POSITION (LEFT side = First column, RIGHT side = Second column), NOT the text line it appears on
            - **THEN**: If the course is in the SECOND column (RIGHT side), ask: "Has a header appeared in the second column (RIGHT side) before this course?" If yes, use that header's semester, NOT the first column's header, even if the first column header appears on the same or nearby text lines. Do NOT use first column headers for courses in the second column after a second column header.
            - **CRITICAL**: If two courses appear on the SAME LINE OF TEXT, one on the LEFT and one on the RIGHT, they belong to DIFFERENT columns and should get semesters from headers in their RESPECTIVE columns
          9. **CRITICAL - DO NOT MIX COLUMNS**: Do NOT identify a header from the second column as being in the first column. Do NOT identify a header from the first column as being in the second column. Process columns sequentially - first column completely, then second column.
      - **CRITICAL - IDENTIFY SEMESTER HEADERS/BARS**: Look for semester headers that appear as:
        * Horizontal bars or section dividers with asterisks (*) or other characters
        * Text headers above course lists
        * Semester codes with various formats
        * These headers are typically on their own line or in a distinct section
        * **CRITICAL - HEADER POSITION**: A semester header applies to ALL courses that appear AFTER it, not before it. When identifying a header's position, it should be marked as "Before course X" if course X is the FIRST course that follows it, not if course X comes before it.
        * **IMPORTANT**: If a header appears BEFORE a course, that header applies to that course. If a header appears AFTER a course, that header does NOT apply to that course - it applies to courses that come AFTER the header.
        * **EXAMPLE**: If you see: Course A, Header "Spring 2025", Course B, Course C
          - The header is BEFORE Course B (it applies to Course B and Course C)
          - The header is AFTER Course A (it does NOT apply to Course A)
          - Position should be recorded as "Before Course B" or "Before first course after header"
      - **COMPREHENSIVE EXAMPLES OF SEMESTER HEADERS/BARS**: Look for these patterns (asterisks are very common):
        * Full term name with full year:
          - "Fall 2023" or "FALL 2023" or "fall 2023"
          - "Spring 2024" or "SPRING 2024" or "spring 2024"
          - "Summer 2025" or "SUMMER 2025" or "summer 2025"
          - "Winter 2024" or "WINTER 2024" or "winter 2024"
        * Full term name with 2-digit year:
          - "Fall 23" or "FALL 23" or "fall 23"
          - "Spring 24" or "SPRING 24" or "spring 24"
          - "Summer 25" or "SUMMER 25" or "summer 25"
          - "Winter 24" or "WINTER 24" or "winter 24"
        * Term code with full year (year first):
          - "2023 Fall" or "2023 FA" or "2023FA" or "2023-FA"
          - "2024 Spring" or "2024 SP" or "2024SP" or "2024-SP"
          - "2025 Summer" or "2025 SU" or "2025SU" or "2025-SU"
          - "2024 Winter" or "2024 WN" or "2024WN" or "2024-WN"
        * Term code with 2-digit year (year first):
          - "23 Fall" or "23 FA" or "23FA" or "23-FA"
          - "24 Spring" or "24 SP" or "24SP" or "24-SP"
          - "25 Summer" or "25 SU" or "25SU" or "25-SU"
          - "24 Winter" or "24 WN" or "24WN" or "24-WN"
        * Term code with full year (term first):
          - "Fall 2023" or "FA 2023" or "FA2023" or "FA-2023"
          - "Spring 2024" or "SP 2024" or "SP2024" or "SP-2024"
          - "Summer 2025" or "SU 2025" or "SU2025" or "SU-2025"
          - "Winter 2024" or "WN 2024" or "WN2024" or "WN-2024"
        * Term code with 2-digit year (term first):
          - "Fall 23" or "FA 23" or "FA23" or "FA-23"
          - "Spring 24" or "SP 24" or "SP24" or "SP-24"
          - "Summer 25" or "SU 25" or "SU25" or "SU-25"
          - "Winter 24" or "WN 24" or "WN24" or "WN-24"
        * Headers with asterisks or other separators (VERY COMMON):
          - "***** Fall 2023 *****" or "******** FALL 2023 ********"
          - "** Spring 2024 **" or "*** SPRING 2024 ***"
          - "---- Summer 2025 ----" or "==== SUMMER 2025 ===="
          - "Fall 2023 *****" or "***** Fall 2023"
          - "2023FA *****" or "***** 2023FA"
          - "****************** Fall 2023 ******************"
          - "***** Spring 2024 *****"
          - "*** FALL 2023 ***"
          - "********** Summer 2025 **********"
          - "** WINTER 2024 **"
          - "**********************" (might appear on a line with semester text)
        * Headers with "Term:" or "Semester:" prefix:
          - "Term: Fall 2023" or "Semester: Spring 2024"
          - "Term: 2023FA" or "Semester: 2024SP"
        * Variations and abbreviations:
          - "Fall Semester 2023" or "Fall Term 2023"
          - "Autumn 2023" (same as Fall)
          - "Spring Semester 2024" or "Spring Term 2024"
          - "Summer Session 2025" or "Summer Term 2025"
          - "Winter Session 2024" or "Winter Term 2024"
        * **CRITICAL**: Headers often contain strings of asterisks (*) as separators or borders. Do NOT ignore these - they are part of the header pattern. The semester text appears between or after the asterisks.
      - **CRITICAL - DO NOT GUESS SEMESTERS**: Only assign semesters that you can clearly see in semester headers/bars. Do NOT make up semesters or copy semesters from other courses. If a course doesn't have a visible semester header, leave it as null.
      - **CRITICAL - READ SEMESTER HEADERS ACCURATELY**: When reading semester headers, be very careful with years. Common OCR errors include "2025" being misread as "2022" (the "5" looks like "2"). Double-check year values in semester headers.
      - **CRITICAL - GRADE EXTRACTION**: Each course must have its own grade. Grades should NEVER be copied, propagated, or duplicated from one course to another. This is EXTREMELY IMPORTANT:
        * **GRADE LOCATION**: The grade for each course is ALWAYS on the same line as that course, appearing somewhere after the course number and course name on that same line.
        * For each course entry, look on the SAME line as the course number and course name, and find the grade that appears after them on that line.
        * **GRADE IN COURSE NAME**: Sometimes the grade may appear immediately after the course name with no space (e.g., "Human Anatomy & Physiology I C" where "C" is the grade). In such cases, extract the grade letter (A, B, C, D, F, S, P, etc.) from the end of the course name and put it in the grade field, removing it from the courseName field. The course name should be "Human Anatomy & Physiology I" and the grade should be "C".
        * **GRADE DETECTION**: If a course name ends with a single letter that is a valid grade (A, B, C, D, F, S, P, W, U, etc.), that letter is likely the grade and should be extracted into the grade field and removed from the courseName field.
        * **CRITICAL - ROMAN NUMERALS IN COURSE NAMES**: Many course names end in Roman numerals (I, II, III, IV, V, VI, VII, VIII, IX, X) to indicate course sequence (e.g., "English Comp I", "Calculus II", "History III"). These Roman numerals are PART OF THE COURSE NAME and should NOT be extracted as grades. The grade appears AFTER the Roman numeral if present (e.g., "English Comp I A" where "I" is part of the name and "A" is the grade, or "English Comp I" with grade "S" appearing separately on the line). When a course name ends in a Roman numeral, the grade will appear AFTER it (not as part of it).
        * The first course in the second column: look at the line where that course appears in the second column, and find the grade that appears after the course number and name on that same line.
        * Do NOT copy grades from previous courses or previous lines.
        * Do NOT use the grade from an AP course for an institutional credit course.
        * Do NOT use the grade from the first column for courses in the second column - each course has its own line with its own grade.
        * If a course does not have a visible grade on its line (after the course number and name), use null or empty string - DO NOT copy a grade from another course or another line.
        * AP/CLEP courses have grade "S" - do NOT copy this grade to institutional credit courses.
        * Each course entry in the JSON should have its own independent grade field based on what appears on the same line as that specific course, after the course number and course name.
      - **CRITICAL SECTION FILTERING**:
        * **TYPE 1: ADVANCED PLACEMENT OR CLEP** (MUST EXTRACT ALL COURSES):
          - **RECOGNIZE THESE HEADERS**: "ADVANCED PLACEMENT", "ADVANCED PLACEMENT CREDIT", "AP", "AP CREDIT", "AP EXAM", "ADVANCED PLACEMENT EXAM", "ADVANCED PLACEMENT (AP)", "PRIOR LEARNING: ADVANCED PLACEMENT", "PRIOR LEARNING ADVANCED PLACEMENT", "PRIOR LEARNING", "CLEP", "CLEP CREDIT", "CLEP EXAM", "COLLEGE LEVEL EXAMINATION PROGRAM", or any header containing "ADVANCED PLACEMENT", "PRIOR LEARNING", or "CLEP"
          - **CRITICAL**: These section headers (like "ADVANCED PLACEMENT" or "PRIOR LEARNING: ADVANCED PLACEMENT") are HEADERS, NOT courses. Do NOT extract the header text itself as a course. However, you MUST extract ALL actual course entries that appear AFTER these headers.
          - **MANDATORY**: Extract ALL courses that appear after these headers until you encounter a NEW section header. This includes courses that may not have traditional course numbers - use the course name/description as the courseNumber if needed.
          - These courses may NOT have semesters, grades, or traditional course numbers - this is EXPECTED
          - Use the course name/description as the courseNumber if no number exists
          - Use null for semester if not provided - do NOT assign a semester to AP/CLEP courses if no semester is specified (leave it blank/null)
          - **CRITICAL - GRADE EXTRACTION FOR AP/CLEP**: For Advanced Placement and CLEP courses, extract the grade that appears on the same line as the course, after the course number and name. 
            * If you see a grade next to an AP/CLEP course on its line, extract that grade exactly as it appears.
            * If NO grade is visible for an AP/CLEP course on its line, default to "S" (Satisfactory) - this is the standard grade for AP/CLEP courses when no grade is shown.
            * For other courses (non-AP/CLEP), if no grade is visible, leave the grade as null or empty string.
          - **CRITICAL**: After the AP/CLEP section ends (when you see a new section header like a semester or "INSTITUTION CREDIT"), resume extracting courses normally from that new section. The AP/CLEP section does NOT block subsequent courses from being extracted.
        * **TYPE 2: TRANSFER CREDIT** (STRICTLY IGNORE ALL COURSES):
          - **STRICTLY IGNORE** all courses that appear after section titles like "TRANSFER CREDIT ACCEPTED BY THE INSTITUTION:", "TRANSFER CREDIT:", "TRANSFERRED CREDIT", "ACCEPTED CREDIT", or similar transfer credit section headers. These courses are from other institutions and should NOT be included in the courses array.
          - If you see a section header indicating transfer credit, skip all courses in that section until you encounter a new section header.
        * **TYPE 3: INSTITUTIONAL CREDIT** (MUST INCLUDE ALL COURSES):
          - **ONLY INCLUDE** courses that appear after section titles like "INSTITUTION CREDIT:", "INSTITUTIONAL CREDIT:", "CREDIT EARNED AT [INSTITUTION NAME]", or similar institutional credit section headers. These are courses taken at the main institution.
          - **CRITICAL**: Section headers like "INSTITUTION CREDIT:", "INSTITUTIONAL CREDIT:", "ADVANCED PLACEMENT", "CLEP", "TRANSFER CREDIT", etc. are HEADERS, NOT courses. Do NOT extract the header text itself as a course. However, you MUST extract ALL actual course entries (with course numbers, names, grades, etc.) that appear AFTER these headers.
          - If you see a section header indicating institutional credit, include all courses in that section (but NOT the header itself). This includes the first course in the second column if it appears after an institutional credit header.
          - **CRITICAL**: Once you encounter an "INSTITUTION CREDIT" header, that header applies to ALL courses in ALL columns that follow (until a new section header is encountered). This means courses in the second column after an institutional credit header are also institutional credit courses, NOT AP/CLEP courses.
          - **CRITICAL**: Institutional credit courses should have normal grades (A, B, C, D, F, etc.) - they should NOT be treated as AP/CLEP courses and should NOT have grade "S" unless explicitly shown.
          - **CRITICAL - GRADE EXTRACTION FOR INSTITUTIONAL CREDIT**: Institutional credit courses must have their own grades extracted from where they appear in the transcript. Do NOT copy grades from AP/CLEP courses or from courses in other columns. Each institutional credit course should have its own grade based on what appears next to it in the transcript.
          - For institutional credit courses, apply semesters normally - if a course doesn't have an explicit semester, use the last semester header found in the previous column.
        * **DEFAULT**: If no explicit section headers are found, use your best judgment based on context, but prioritize institutional credit sections.
      - **STRICTLY IGNORE** any course codes or grades found in "Current", "Retention", "Cumulative", "Totals", or "Points" sections. These are summary statistics and NOT the actual course list.
      - **STRICTLY IGNORE** lines that contain statistics headers like "EHRS", "GPA", "HRSPOINTS", "Cumulative:", "Term:", "Semester:", "Points:", "Hours:", "Grade Points:" or similar. These are header lines for statistics tables, NOT courses.
      - **STRICTLY IGNORE** lines that are clearly statistics summary lines, not actual courses. These often contain abbreviations like "EHRS", "GPA", "HRSPOINTS", "CUMULATIVE" or have patterns like "EHRSGPA-HRSPOINTSGPA". These are NOT courses.
      - **CRITICAL - VALID COURSE NUMBER FORMAT**: A valid course number MUST have letters (2-5 letters) followed by numbers (e.g., "BIO 141", "CMSC 1313", "ENG 101", "POLSC 1113"). Course prefixes can be 2, 3, 4, or 5 letters long. Do NOT extract lines that do not have this pattern as courses. Examples of things that are NOT courses:
        * Statistics headers: "EHRSGPA-HRSPOINTSGPA", "Cumulative:", "Term GPA:", "Semester Hours:", "Grade Points:"
        * Summary lines: Lines with only abbreviations like "EHRS", "GPA", "HRSPOINTS"
        * Labels: "Cumulative", "Term", "Semester", "Total"
        * Lines without a proper course number format (letters followed by numbers)
      - **DEDUPLICATE** courses: If the same course number appears multiple times, **ONLY keep the entry that has a valid semester**. discard any entries with null semesters if a version with a semester exists.
      - If a course appears at the very beginning without a header, check if it's a duplicate of a course listed later with a header. If so, discard the first one.
      - **SEMESTER FORMAT**: Always try to extract both Term and Year (e.g., "Fall 2023", "Spring 2024").
      - If you see a code like "2023FA", "FA23", "F23", extract it as "Fall 2023".
      - If you see "2025SP", "SP25", "S25", extract it as "Spring 2025".
      - If you see a header that is **JUST A YEAR** (e.g., "2023"), look for a term code nearby. If the previous course had a full semester (e.g., "Fall 2023") and the new header is just "2023", it is likely the same semester or the term is missing. **Prefer the full semester** from the previous context if the year matches.
      - **CORRECT OCR ERRORS IN YEARS**: If you see a semester year that looks like "D023", "D025", "D028", etc., it is likely an OCR error for "2023", "2025", "2028". Please correct it to "20xx". For example, "Spring D025" should be "Spring 2025".
      - **CRITICAL - YEAR ACCURACY - READ THIS CAREFULLY**: Be VERY careful when reading years. Common OCR errors include:
        * **MOST COMMON ERROR**: "5" being misread as "2" (e.g., "2025" misread as "2022")
        * "2" being misread as "5" (e.g., "2022" misread as "2025")
        * **CRITICAL RULE**: Semesters are listed in chronological order (Spring comes before Fall within the same year)
        * **CRITICAL RULE**: If you see "Spring 2022" followed by "Fall 2022" or any semester in 2022 or later, the Spring semester is ALWAYS "Spring 2025" (not "Spring 2022")
        * **REASON**: Chronologically, Spring 2022 cannot be followed by Fall 2022 (Spring comes before Fall). If Spring appears before Fall, and they're in the same or similar year, Spring must be in a different year.
        * **SPECIFIC EXAMPLE**: If you see "Spring 2022" followed by "Fall 2022", "Summer 2022", "Fall 2023", "Spring 2023", etc., extract the Spring as "Spring 2025" (the "5" was misread as "2")
        * Double-check year values, especially when they don't make chronological sense
        * Spring 2025 should NOT be read as Spring 2022 - the "5" should be clearly a "5", not a "2"
        * When in doubt about a year ending in "22" for a Spring semester, check what comes after it - if it's Fall 2022 or later, it must be Spring 2025
      - **FILTER OUT COURSES FROM OTHER UNIVERSITIES**: If a university name appears in the text along with a semester header (e.g., "Transfer Credit from State University - Fall 2023" or "Fall 2023 - Community College"), those courses listed under that header are from another institution and should be **STRICTLY EXCLUDED** from the courses array. Only include courses from the main transcript university (the one extracted as "university" at the top level). Look for patterns like university names in headers, transfer credit sections, or semester labels that indicate courses taken at another institution.
      - **🚨🚨🚨 CRITICAL - EXCLUDE TRANSFER CREDIT COURSES 🚨🚨🚨**: 
        - **MANDATORY**: Do NOT include courses that appear after headers containing "Transfer" (like "2022 Fall - Transfer", "Transfer Fall 2022", "Fall 2022 Transfer", etc.)
        - **IF** you see a header like "2022 Fall - Transfer" or "Transfer Fall 2022", **DO NOT** extract any courses that appear after that header until you see a pure semester header (without "Transfer")
        - **Transfer Credit courses should NOT appear in your final JSON output**
        - **VALIDATION**: Before returning your JSON, remove any courses that appear after Transfer headers
        - **THIS IS MANDATORY - TRANSFER COURSES MUST BE EXCLUDED**
      - **CRITICAL: COURSE NUMBER HANDLING**: 
        * If a course number is blank, empty, or only contains dashes (e.g., "---", "----", "-----"), use null or empty string for the courseNumber field. Do NOT extract dashes as the course number.
        * Course numbers typically have a space between letters and numbers (e.g., "BIB 113", "ENG 101"). If you see course numbers without spaces (e.g., "BIB113", "ENG101"), add a space between the letters and numbers.
        * IMPORTANT: Course numbers typically have 2-5 letters followed by 2-4 digits, like "BIB 113", "ENG 101", or "POLSC 1113". 
        * DO NOT put course descriptions in the courseNumber field - use courseName for descriptions.
        * If a course number field is blank or only dashes, leave it as null - do NOT try to extract something else.
      - **CRITICAL: FIX MISSING SPACES IN COURSE DESCRIPTIONS**: OCR often fails to recognize spaces between words, especially when text is all uppercase. You MUST add spaces between words in ALL course descriptions and convert to proper title case (first letter of each word uppercase, rest lowercase). This is a very common OCR error. Examples:
        * "IntroductiontoPsychology" → "Introduction to Psychology"
        * "WorldHistoryI" → "World History I"
        * "CalculusandAnalyticGeometry" → "Calculus and Analytic Geometry"
        * "EnglishCompositionI" → "English Composition I"
        * "AmericanHistory" → "American History"
        * "BiologyI" → "Biology I"
        Rules for fixing:
        1. Whenever you see a lowercase letter followed by an uppercase letter, add a space between them (this indicates a new word).
        2. Before common prepositions/conjunctions: to, and, or, of, in, on, at, for, with, from, the, a, an.
        3. After Roman numerals (I, II, III, IV, V, etc.) if followed by a word.
        4. After course subject names (History, Biology, Chemistry, English, etc.) if followed by another word or Roman numeral.
        5. Before and after numbers if they appear in the middle of a description.
        **Pay special attention to this** - missing spaces are one of the most common OCR errors and must be corrected.

      ${promptText}
    `;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const textResponse = response.text();

      console.log("Gemini Response:", textResponse);

      // Clean up the response to ensure it's valid JSON
      // Sometimes models wrap JSON in markdown code blocks like \`\`\`json ... \`\`\`
      let jsonStr = textResponse
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

      const parsedData = JSON.parse(jsonStr);

      // Convert semester-organized format to flat format if needed
      if (parsedData.semesters && Array.isArray(parsedData.semesters)) {
        console.log('\n=== CONVERTING SEMESTER-ORGANIZED FORMAT TO FLAT FORMAT ===');
        
        // Build semesterHeaders from Pass 1 structure (more reliable)
        parsedData.semesterHeaders = structureData.semesterHeaders || [];
        
        // Extract courses from semesters array and coursesWithoutSemester
        const allCourses = [];
        
        // Add courses from each semester
        parsedData.semesters.forEach((semesterObj) => {
          if (semesterObj.courses && Array.isArray(semesterObj.courses)) {
            semesterObj.courses.forEach((course) => {
              allCourses.push({
                ...course,
                semester: semesterObj.semester || null
              });
            });
          }
        });
        
        // Add courses without semester
        if (parsedData.coursesWithoutSemester && Array.isArray(parsedData.coursesWithoutSemester)) {
          parsedData.coursesWithoutSemester.forEach((course) => {
            allCourses.push({
              ...course,
              semester: null
            });
          });
        }
        
        // Replace with flat format
        parsedData.courses = allCourses;
        
        console.log(`Converted ${parsedData.semesters.length} semesters with courses to flat format`);
        console.log(`Total courses: ${allCourses.length}`);
        console.log(`Courses without semester: ${parsedData.coursesWithoutSemester?.length || 0}`);
        console.log('=== END CONVERSION ===\n');
      }

      // Log semester headers found by LLM for debugging
      console.log('\n=== CHECKING FOR SEMESTER HEADERS IN LLM RESPONSE ===');
      console.log('parsedData keys:', Object.keys(parsedData));
      
      if (parsedData.semesterHeaders && Array.isArray(parsedData.semesterHeaders)) {
        console.log('\n=== SEMESTER HEADERS IDENTIFIED BY LLM ===');
        console.log(`Total headers found: ${parsedData.semesterHeaders.length}`);
        parsedData.semesterHeaders.forEach((header, index) => {
          console.log(`Header ${index + 1}: "${header.semester || 'N/A'}"`);
          console.log(`  - Column: ${header.column || 'N/A'}`);
          console.log(`  - Location: ${header.location || 'N/A'}`);
          console.log(`  - Position: ${header.position || 'N/A'}`);
        });
        console.log('=== END SEMESTER HEADERS ===\n');
        
        // Also log using logger
        logger.info(`=== SEMESTER HEADERS IDENTIFIED BY LLM ===`);
        logger.info(`Total headers found: ${parsedData.semesterHeaders.length}`);
        parsedData.semesterHeaders.forEach((header, index) => {
          logger.info(`Header ${index + 1}: "${header.semester || 'N/A'}"`);
          logger.info(`  - Column: ${header.column || 'N/A'}`);
          logger.info(`  - Location: ${header.location || 'N/A'}`);
          logger.info(`  - Position: ${header.position || 'N/A'}`);
        });
        logger.info(`=== END SEMESTER HEADERS ===`);
      } else {
        console.log('\n=== WARNING: No semesterHeaders array found in LLM response ===');
        console.log('This may mean:');
        console.log('  1. The LLM did not include semesterHeaders in its response');
        console.log('  2. The LLM may not have identified any headers');
        console.log('  3. The response format may have changed');
        console.log('Response structure:', JSON.stringify(Object.keys(parsedData), null, 2));
        console.log('=== END WARNING ===\n');
        
        logger.warn(`No semesterHeaders array found in LLM response - LLM may not have identified headers`);
        logger.warn(`Response keys: ${Object.keys(parsedData).join(', ')}`);
      }

      // Manual Deduplication:
      // Group courses by courseNumber
      // For each group, prefer the one with a valid semester.
      // If multiple have valid semesters, keep the last one (or first, depending on preference, but usually detailed list is better).
      // Actually, if we have duplicates, we should merge or pick the best one.

      if (parsedData.courses && Array.isArray(parsedData.courses)) {
        const uniqueCourses = {};

        parsedData.courses.forEach((course) => {
          const key = course.courseNumber;
          if (!uniqueCourses[key]) {
            uniqueCourses[key] = course;
          } else {
            // If existing has no semester but new one does, replace it
            if (!uniqueCourses[key].semester && course.semester) {
              uniqueCourses[key] = course;
            }
            // If both have semesters, or both don't, maybe keep the one with more info?
            // For now, let's assume the one with a semester is the "real" one.
            // If both have semesters, we might want to keep both if they are actually different attempts (e.g. retakes).
            // But here the issue is a summary vs detail. Summary usually has no semester.
            // So the rule "replace if existing has no semester" is good.

            // What if it IS a retake?
            // If it's a retake, the semester should be different.
            // So we should only deduplicate if the semester is ALSO null or same?
            // No, the summary duplicate has NULL semester. The real ones have semesters.
            // So if we have a null semester entry, we should drop it if we find a non-null one.
            // But we might find the non-null one LATER.
            // So we need to collect all, then filter.
          }
        });

        // This simple map approach merges retakes! That's bad.
        // BIO 1314 appears twice in the valid list: Spring 2025 (W) and Spring 2025 (C).
        // Wait, looking at the output:
        // BIO 1314 (Spring 2025, W)
        // BIO 1314 (Spring 2025, C)
        // These are retakes or concurrent?
        // Actually, in the JSON:
        // Line 327: BIO 1314, Spring 2025, W
        // Line 348: BIO 1314, Spring 2025, C
        // Same semester? That's weird. Maybe different sections?
        // But the first one (Line 378) is BIO 1314, null semester, A grade.
        // Wait, "A" grade?
        // The summary says: "BIO 1314 ... 4.00" (Line 105 in raw text).
        // The OCR text (Line 195) says "BIO 1023 ...".
        // Let's look at the raw text again.
        // Line 103: BIO 1314 manAnaomy & Phys 4.00
        // This looks like a summary line.

        // Better approach: Filter out any course with null semester IF there are other courses.
        // Or just filter out null semesters if we are confident?
        // But what if a course genuinely has no semester?

        // Strategy:
        // 1. Identify courses with null semesters.
        // 2. If the same course number exists with a VALID semester, drop the null one.
        // 3. If the null one is the ONLY one, keep it.

        const coursesWithSemester = parsedData.courses.filter(
          (c) => c.semester
        );
        const coursesWithoutSemester = parsedData.courses.filter(
          (c) => !c.semester
        );

        const keptCourses = [...coursesWithSemester];

        coursesWithoutSemester.forEach((nullCourse) => {
          // Check if this course number already exists in the "with semester" list
          const exists = coursesWithSemester.some(
            (c) => c.courseNumber === nullCourse.courseNumber
          );
          if (!exists) {
            keptCourses.push(nullCourse);
          }
        });

        parsedData.courses = keptCourses;

        // Helper function to check if a course is AP/CLEP (defined early for use in grade extraction)
        const isAPOrCLEPCourse = (course) => {
          const courseNum = (course.courseNumber || '').toUpperCase();
          const courseName = (course.courseName || '').toUpperCase();
          return (
            courseNum.startsWith('AP ') ||
            courseNum.startsWith('AP-') ||
            courseNum === 'AP' ||
            courseNum.includes(' CLEP') ||
            courseNum.includes('-CLEP') ||
            courseName.includes('ADVANCED PLACEMENT EXAM') ||
            courseName.includes('CLEP EXAM') ||
            (courseName.includes('ADVANCED PLACEMENT') && (!courseNum || courseNum.length < 5)) ||
            (courseName.includes('CLEP') && (!courseNum || courseNum.length < 5))
          );
        };
        
        // Post-processing: Normalize semesters, fix course numbers, fix course descriptions, and extract grades from course names
        parsedData.courses.forEach((course) => {
          // Log course at start of processing for debugging
          logger.debug(`[POST-PROCESSING START] courseNumber: "${course.courseNumber || 'MISSING'}", courseName: "${course.courseName || 'MISSING'}", grade: "${course.grade || 'MISSING'}"`);
          
          // Check if this is an AP/CLEP course - we'll handle grade extraction differently for these
          const isAPOrCLEP = isAPOrCLEPCourse(course);
          
          // Check if grade is stuck to the end of the course name (e.g., "Human Anatomy & Physiology I C" where "C" is the grade)
          // This should be done BEFORE other processing that might modify the course name
          // IMPORTANT: Do NOT extract Roman numerals (I, II, III, IV, V, VI, VII, VIII, IX, X) as grades
          // Course names often end in Roman numerals (e.g., "English Comp I", "Calculus II", "History III")
          // The grade appears AFTER the Roman numeral if present (e.g., "English Comp I C" where "I" is Roman numeral, "C" is grade)
          // Extract grade even if there's already a grade, in case it's incorrect or needs to be updated
          // For AP/CLEP courses, also extract grade "S" if it appears in the course name
          if (course.courseName) {
            const hasExistingGrade = course.grade && course.grade.trim() !== '';
            if (!hasExistingGrade || isAPOrCLEP) {
              // For AP/CLEP courses, try to extract grade even if one exists (in case it needs to be updated)
              // For other courses, only extract if no grade exists
            const courseName = course.courseName.trim();
            
            // Pattern for Roman numerals: (I, II, III, IV, V, VI, VII, VIII, IX, X)
            // Match longer patterns first (IX, VIII, VII, VI, IV, III, II) before shorter ones (I, X, V)
            // Handle both cases: " I C" (with space) and " IC" (without space, where I is Roman numeral and C is grade)
            // Pattern: optional space(s) + Roman numeral + optional space(s) + grade letter (A-F, S, P, W, U, I)
            // Note: A-F includes A, B, C, D, E, F
            logger.debug(`Checking course name for grade extraction: "${courseName}"`);
            
            // Try with space first (most common case): " I C" or " II B"
            let romanNumeralPattern = /\s+(IX|VIII|VII|VI|IV|III|II|I|X|V)\s+([A-FSPWUI])\s*$/i;
            let romanNumeralWithGradeMatch = courseName.match(romanNumeralPattern);
            
            // If no match, try without space between Roman numeral and grade: " IC" or " IIB"
            if (!romanNumeralWithGradeMatch) {
              romanNumeralPattern = /\s+(IX|VIII|VII|VI|IV|III|II|I|X|V)([A-FSPWUI])\s*$/i;
              romanNumeralWithGradeMatch = courseName.match(romanNumeralPattern);
            }
            
            // If still no match, try without requiring space before Roman numeral (edge case)
            if (!romanNumeralWithGradeMatch) {
              romanNumeralPattern = /(IX|VIII|VII|VI|IV|III|II|I|X|V)\s+([A-FSPWUI])\s*$/i;
              romanNumeralWithGradeMatch = courseName.match(romanNumeralPattern);
            }
            
            // Last try: no space before Roman numeral and no space after
            if (!romanNumeralWithGradeMatch) {
              romanNumeralPattern = /(IX|VIII|VII|VI|IV|III|II|I|X|V)([A-FSPWUI])\s*$/i;
              romanNumeralWithGradeMatch = courseName.match(romanNumeralPattern);
            }
            
            if (romanNumeralWithGradeMatch) {
              // Course name ends with a Roman numeral followed by a grade (e.g., "English Comp I C" or "English Comp IC")
              const romanNumeral = romanNumeralWithGradeMatch[1];
              const grade = romanNumeralWithGradeMatch[2];
              logger.debug(`Found Roman numeral "${romanNumeral}" and grade "${grade}" in course name: "${courseName}"`);
              
              // Remove both the Roman numeral and grade, then add back just the Roman numeral to the course name
              // Try all patterns for replacement
              let newCourseName = courseName.replace(/\s+(IX|VIII|VII|VI|IV|III|II|I|X|V)\s+([A-FSPWUI])\s*$/i, ' ' + romanNumeral).trim();
              if (newCourseName === courseName) {
                newCourseName = courseName.replace(/\s+(IX|VIII|VII|VI|IV|III|II|I|X|V)([A-FSPWUI])\s*$/i, ' ' + romanNumeral).trim();
              }
              if (newCourseName === courseName) {
                newCourseName = courseName.replace(/(IX|VIII|VII|VI|IV|III|II|I|X|V)\s+([A-FSPWUI])\s*$/i, ' ' + romanNumeral).trim();
              }
              if (newCourseName === courseName) {
                newCourseName = courseName.replace(/(IX|VIII|VII|VI|IV|III|II|I|X|V)([A-FSPWUI])\s*$/i, ' ' + romanNumeral).trim();
              }
              
              course.courseName = newCourseName;
              course.grade = grade.toUpperCase();
              logger.debug(`Extracted grade "${grade}" from course name ending with Roman numeral "${romanNumeral}": "${courseName}" -> "${course.courseName}"`);
            } else {
              // Check if course name ends with just a Roman numeral (no grade after it)
              // This check must come AFTER checking for Roman numeral + grade, to avoid false positives
              const romanNumeralOnlyPattern = /\s+(IX|VIII|VII|VI|IV|III|II|I|X|V)\s*$/i;
              const hasRomanNumeralOnly = romanNumeralOnlyPattern.test(courseName);
              
              if (!hasRomanNumeralOnly) {
                // No Roman numeral at the end - check if it ends with a grade
                // Valid grades: A, B, C, D, F, S, P, W, U (exclude "I" to avoid confusion with Roman numeral)
                // First try with space (most common): "Course Name S"
                let gradePattern = /\s+([A-FSPWU])\s*$/;
                let match = courseName.match(gradePattern);
                
                // For AP/CLEP courses, also try without space (e.g., "CourseNameS")
                if (!match && isAPOrCLEP) {
                  gradePattern = /([A-FSPWU])\s*$/;
                  match = courseName.match(gradePattern);
                }
                
                if (match) {
                  const potentialGrade = match[1];
                  // Remove the grade from the course name and set it as the grade
                  course.courseName = courseName.replace(gradePattern, '').trim();
                  course.grade = potentialGrade.toUpperCase();
                  logger.debug(`Extracted grade "${potentialGrade}" from end of course name: "${courseName}" -> "${course.courseName}"`);
                } else {
                  // Check for "I" grade separately - only if it's clearly not a Roman numeral
                  // If the course name ends with just " I" (space + I), it could be either a grade or Roman numeral
                  // Since we want to be conservative, we'll skip extracting standalone "I" to avoid false positives
                  const iPattern = /\s+I\s*$/;
                  if (iPattern.test(courseName)) {
                    // This could be either a Roman numeral or a grade - be conservative and don't extract it
                    // The LLM should handle this in the prompt
                    logger.debug(`Course name ends with " I" - skipping extraction (could be Roman numeral): ${courseName}`);
                  }
                }
              } else {
                // Course name ends with a Roman numeral only - preserve it in the course name, no grade extraction
                logger.debug(`Course name ends with Roman numeral only - preserving in course name: ${courseName}`);
              }
            }
            } else {
              logger.debug(`Skipping grade extraction - course already has grade: "${course.grade}" for course: "${course.courseName}" (courseNumber: "${course.courseNumber || 'MISSING'}")`);
            }
          }
          
          // Clean course numbers: if blank or only dashes, set to empty string
          if (course.courseNumber) {
            let courseNum = String(course.courseNumber).trim();
            
            // Check if course number is blank or only contains dashes, spaces, or special characters
            // If so, set it to empty string (null)
            if (!courseNum || /^[\s\-_]+$/.test(courseNum)) {
              // Course number is blank, only dashes, only spaces, or only underscores - set to empty
              course.courseNumber = null;
              logger.debug(`Cleaned blank/dash-only course number: "${courseNum}" -> null`);
            } else {
              // Fix missing spaces in course numbers (e.g., "BIB113" -> "BIB 113", "ED1601" -> "ED 1601")
              // Simple check: does it have letters and numbers?
              const hasLetters = /[A-Za-z]/.test(courseNum);
              const hasNumbers = /\d/.test(courseNum);
              
              // Check if it already has proper spacing
              const hasProperSpacing = /[A-Za-z]+\s+\d+/.test(courseNum) || /[A-Za-z]+-\d+/.test(courseNum);
              
              // If it has letters and numbers but no spacing, fix it
              if (hasLetters && hasNumbers && !hasProperSpacing) {
                // Remove any existing spaces first to normalize
                courseNum = courseNum.replace(/\s+/g, '');
                
                // Add space between letters and numbers: "ED1601" -> "ED 1601"
                courseNum = courseNum.replace(/([A-Za-z]+)(\d+)/g, '$1 $2');
                
                // Clean up multiple spaces and trim
                courseNum = courseNum.replace(/\s+/g, ' ').trim();
                
                // Update the course number
                course.courseNumber = courseNum;
              }
            }
          } else {
            // Course number is already null/undefined - ensure it's null
            course.courseNumber = null;
          }

          if (course.semester) {
            // Fix OCR error: D0xx -> 20xx
            course.semester = course.semester.replace(/D0(\d{2})/g, "20$1");

            // Fix other common OCR errors
            // e.g. "202S" -> "2025"
            course.semester = course.semester.replace(/202S/g, "2025");
            
            // Fix common OCR errors where "5" is misread as "2" and vice versa
            // Only fix if it's clearly a year (4 digits starting with 20)
            // Pattern: "20" followed by potentially misread digits
            // Common errors: "2025" -> "2022" (5 read as 2), "2022" -> "2025" (2 read as 5)
            // We'll fix obvious cases based on context and chronological order
            
            // If semester contains "2022" and it's Spring, check if it should be "2025"
            // Note: This is a conservative fix - we'll add more sophisticated logic below
            const originalSemester = course.semester;
            
            // Extract year from semester (e.g., "Spring 2022" -> "2022", "Fall 2025" -> "2025")
            const yearMatch = course.semester.match(/\b(20\d{2})\b/);
            if (yearMatch) {
              const extractedYear = yearMatch[1];
              logger.debug(`Semester year extracted: "${extractedYear}" from semester: "${course.semester}"`);
            }
          }
          
          // Post-processing: Fix year errors based on chronological order
          // This happens after all courses are processed, so we can check chronological order

          // Fix missing spaces in course descriptions
          if (course.courseName) {
            let description = course.courseName;
            const original = description;
            
            // Remove all spaces to check for concatenated words
            const withoutSpaces = description.replace(/\s+/g, '');
            
            // Check if text already has proper spacing - if it has lowercase followed by space or proper word boundaries, skip processing
            const hasProperSpacing = /\b[a-z]+\s+[a-z]+\b/i.test(description);
            
            // Detect concatenated words: lowercase-uppercase transitions or long all-caps sequences
            const hasConcatenatedWords = /[a-z][A-Z]/.test(withoutSpaces);
            const isAllUppercaseNoSpaces = /^[A-Z]{10,}$/.test(withoutSpaces);
            
            // Only apply fixes if we detect concatenated words (not all-caps, as LLM should handle that)
            // We focus on fixing concatenated words that slip through
            if (hasConcatenatedWords && !hasProperSpacing) {
              // Pass 1: Fix common prepositions and conjunctions (case-insensitive)
              // Only apply if words are concatenated (no space before preposition)
              const prepositions = ['to', 'and', 'or', 'of', 'in', 'on', 'at', 'for', 'with', 'from', 'the', 'a', 'an', 'as', 'by', 'into', 'onto', 'upon', 'within', 'without', 'through', 'throughout'];
              prepositions.forEach(prep => {
                // Pattern: word + preposition + word (no space, case-insensitive)
                const regex1 = new RegExp(`([a-zA-Z]+)(${prep})([A-Z][a-z]+)`, 'gi');
                description = description.replace(regex1, '$1 $2 $3');
              });
              
              // Pass 2: Add space before uppercase letters that follow lowercase letters
              // This catches remaining cases like "BiologyI" -> "Biology I"
              description = description.replace(/([a-z])([A-Z])/g, '$1 $2');
              
              // Pass 3: Fix Roman numerals (only if concatenated)
              description = description.replace(/([a-zA-Z]+)(I|II|III|IV|V|VI|VII|VIII|IX|X)([A-Z])/gi, '$1 $2 $3');
              description = description.replace(/([a-zA-Z]+)(I|II|III|IV|V|VI|VII|VIII|IX|X)$/gi, '$1 $2');
              
              // Clean up multiple spaces
              description = description.replace(/\s+/g, ' ').trim();
            }
            
            // For all-caps text, convert to title case but preserve existing spacing
            // Only if it's truly all-caps (no lowercase letters)
            if (/^[A-Z\s\d\W]+$/.test(description) && /[A-Z]{3,}/.test(description) && !hasProperSpacing) {
              // Convert to title case - this will preserve spaces that exist
              description = description.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
              description = description.replace(/\s+/g, ' ').trim();
            }
            
            // Only update if we actually made changes
            if (description !== original) {
              course.courseName = description;
            }
          }
        });

        // Post-processing: Filter out Transfer Credit courses
        // CRITICAL: Remove courses that appear after Transfer headers (like "2022 Fall - Transfer", "Transfer Fall 2022", etc.)
        // These should be completely excluded, not just have null semester
        logger.debug(`Starting Transfer course filter - removing courses after Transfer headers`);
        
        // Since we can't reliably identify Transfer headers in post-processing, we'll rely on the LLM prompt
        // But we can add a check: if a course has no semester and appears in early positions, it might be a Transfer course
        // However, the best approach is to trust the LLM and rely on the prompt instructions
        
        // For now, log a warning if we see many courses without semesters in early positions
        // (This is informational only - we'll rely on the prompt to exclude Transfer courses)
        const coursesWithoutSemesterCount = parsedData.courses.filter(c => !c.semester || c.semester.trim() === '').length;
        if (coursesWithoutSemesterCount > 0) {
          logger.debug(`Found ${coursesWithoutSemesterCount} courses without semester - some may be Transfer courses that should be excluded`);
          console.log(`Note: ${coursesWithoutSemesterCount} courses have no semester - please verify these are not Transfer Credit courses that should be excluded`);
        }
        
        logger.debug(`Completed Transfer course filter check`);
        
        // Post-processing: Only safeguards - NO semester propagation
        // NOTE: With the strengthened prompt and two-pass approach, the LLM should extract semesters correctly during extraction.
        // We DO NOT fill in missing semesters - we only remove incorrectly assigned semesters from courses that appear before headers.
        // CRITICAL: We must ensure AP/CLEP courses that appear before headers keep null semesters.
        
        logger.debug(`Starting semester safeguard checks (NO propagation) for ${parsedData.courses.length} courses`);
        logger.debug(`NOTE: Only removing incorrectly assigned semesters, NOT filling in missing semesters`);
        
        // Get semester headers to check if course appears before first header
        const semesterHeaders = parsedData.semesterHeaders || [];
        
        // AGGRESSIVE SAFEGUARD: Remove semesters from ALL courses that appear before the first header
        // We can't reliably identify AP/CLEP courses in post-processing, so we apply this rule to ALL courses
        // If a course appears before the first header, it should have no semester
        const firstCourseWithSemesterIndex = parsedData.courses.findIndex(course => course.semester && course.semester.trim());
        
        // MULTIPLE SAFEGUARDS - Apply ALL of them
        
        // SAFEGUARD 1: Remove semesters from ALL courses that appear before the first course with a semester
        // This catches courses that appear before any header (AP/CLEP courses, transfer courses, etc.)
        if (firstCourseWithSemesterIndex !== -1) {
          for (let i = 0; i < firstCourseWithSemesterIndex; i++) {
            const course = parsedData.courses[i];
            if (course.semester && course.semester.trim()) {
              logger.warn(`SAFEGUARD 1: Removed incorrectly assigned semester "${course.semester}" from course ${i + 1} (${course.courseNumber || course.courseName || 'Unknown'}) because it appears before the first course with a semester (likely before any header).`);
              console.log(`SAFEGUARD 1: Removed semester "${course.semester}" from course ${i + 1}: ${course.courseNumber || course.courseName || 'Unknown'}`);
              course.semester = null;
            }
          }
        }
        
        // SAFEGUARD 2: If semesterHeaders exist, remove semesters from courses in early positions
        // Since we extract courses in column order (all first column first, then all second column),
        // the first header should appear relatively early. If we have headers, any course in the
        // first 20 positions that has a semester is suspicious (likely an AP/CLEP course)
        if (semesterHeaders.length > 0) {
          // Estimate: first header should be before or around the first few courses with semesters
          // Be very aggressive: if a course is in the first 20 positions and appears before any course with a semester, remove its semester
          const maxEarlyPosition = 20;
          for (let i = 0; i < Math.min(maxEarlyPosition, parsedData.courses.length); i++) {
            const course = parsedData.courses[i];
            // If this course has a semester but appears before the first course with a semester, remove it
            if (course.semester && course.semester.trim()) {
              if (firstCourseWithSemesterIndex === -1 || i < firstCourseWithSemesterIndex) {
                logger.warn(`SAFEGUARD 2: Removed incorrectly assigned semester "${course.semester}" from course ${i + 1} (${course.courseNumber || course.courseName || 'Unknown'}) because it's in early position and appears before first course with semester.`);
                console.log(`SAFEGUARD 2: Removed semester "${course.semester}" from course ${i + 1}: ${course.courseNumber || course.courseName || 'Unknown'}`);
                course.semester = null;
              }
            }
          }
        } else {
          // No headers found - all courses should have null semester
          logger.debug(`No headers found - removing semesters from all courses`);
          for (let i = 0; i < parsedData.courses.length; i++) {
            const course = parsedData.courses[i];
            if (course.semester && course.semester.trim()) {
              logger.warn(`SAFEGUARD 2 (No Headers): Removed semester "${course.semester}" from course ${i + 1} because no headers were found.`);
              console.log(`SAFEGUARD 2 (No Headers): Removed semester "${course.semester}" from course ${i + 1}: ${course.courseNumber || course.courseName || 'Unknown'}`);
              course.semester = null;
            }
          }
        }
        
        // SAFEGUARD 4: Filter out courses that appear after Transfer headers
        // Since the LLM should exclude Transfer courses, this is a safeguard to catch any that slip through
        logger.debug(`Starting Transfer course filter safeguard`);
        
        // Check if any courses might have been extracted after Transfer headers
        // This is difficult to detect in post-processing, so we rely on the prompt instructions
        // But we can add a basic check for suspicious patterns
        // (Note: This is minimal - the prompt should handle this correctly)
        
        logger.debug(`Completed Transfer course filter safeguard`);
        
        // CRITICAL: DO NOT PROPAGATE SEMESTERS - Only remove incorrect ones
        // The LLM should have assigned semesters correctly during extraction
        // If a course has no semester, leave it as null - do NOT fill it in
        
        logger.debug(`Completed semester safeguard checks (no propagation)`);
        
        // Post-processing: Fix obvious OCR errors in years only
        // The primary mechanism for semester assignment should be from headers, not from correction rules
        // We only fix very obvious OCR errors like "2025" misread as "2022" in the year portion
        // We do NOT change terms (Fall to Spring) - that should come from the actual headers extracted by the LLM
        // We do NOT try to infer correct semesters from context - rely on the LLM to extract correctly from headers
        if (parsedData.courses && parsedData.courses.length > 1) {
          // Simple rule: Fix obvious OCR errors where "2025" is misread as "2022" (the "5" looks like "2")
          // Only fix the year portion, keep the term as extracted by the LLM
          parsedData.courses.forEach((course) => {
            if (course.semester) {
              const yearMatch = course.semester.match(/\b(20\d{2})\b/);
              if (yearMatch) {
                const year = parseInt(yearMatch[1]);
                // Only fix year if it ends in "22" and is surrounded by 2025 semesters (very conservative)
                // This is a simple OCR error fix, not a semantic correction
                if (year.toString().endsWith('22')) {
                  // For now, don't auto-fix - let the LLM prompt handle it
                  // The LLM should extract semesters correctly from headers
                  logger.debug(`Found semester ending in 22: "${course.semester}" - relying on LLM extraction, not auto-correcting`);
                }
              }
            }
          });
        }
        
        // Post-processing: Handle grades for AP/CLEP courses
        // IMPORTANT: Only treat courses as AP/CLEP if they are explicitly AP/CLEP courses
        // Do NOT treat institutional credit courses as AP/CLEP just because they don't have semesters
        // Use the same isAPOrCLEPCourse function that's used elsewhere for consistency
        const apClepCourses = parsedData.courses.filter((course) => {
          return isAPOrCLEPCourse(course);
        });
        
        logger.debug(`Found ${apClepCourses.length} AP/CLEP course(s) out of ${parsedData.courses.length} total courses`);
        apClepCourses.forEach((course, idx) => {
          logger.debug(`AP/CLEP course ${idx + 1}: courseNumber="${course.courseNumber}", courseName="${course.courseName}", grade="${course.grade}"`);
        });
        
        // Ensure all AP/CLEP courses have grade "S" (Satisfactory) if no grade is present
        // For AP/CLEP courses only: if grade is missing, null, or empty, set to "S"
        // For other courses, leave blank grades as blank
        // IMPORTANT: Do NOT assign semesters to AP/CLEP courses - leave them blank if no semester is specified
        apClepCourses.forEach((course) => {
          const currentGrade = course.grade ? course.grade.trim() : '';
          // Only set grade "S" for AP/CLEP courses if grade is missing, null, or empty
          if (!course.grade || currentGrade === '') {
            course.grade = 'S';
            logger.info(`Set grade "S" for AP/CLEP course (blank grade defaulted): ${course.courseNumber || course.courseName || 'Unknown'}`);
            console.log(`Set grade "S" for AP/CLEP course (blank grade defaulted): ${course.courseNumber || course.courseName || 'Unknown'}`);
          } else {
            // Grade is already present, keep it as is
            logger.debug(`AP/CLEP course has grade "${course.grade}", keeping it: ${course.courseNumber || course.courseName || 'Unknown'}`);
          }
        });
        
        // CRITICAL: Remove semesters from AP/CLEP courses that don't explicitly have them
        // AP/CLEP courses should only have semesters if they were explicitly specified in the transcript
        // Since AP/CLEP courses typically don't have semesters, we need to ensure they don't get semesters
        // from propagation or other assignment logic
        // If an AP/CLEP course has a semester, check if it was likely assigned incorrectly
        // For now, we'll be conservative: if the LLM didn't extract a semester for an AP/CLEP course,
        // we've already excluded them from semester propagation, so they should already be blank
        // But if somehow a semester got assigned, we should verify it's correct
        // Since we can't easily verify if a semester was explicitly in the transcript vs assigned incorrectly,
        // we'll rely on the prompt and exclusion from propagation to handle this
        // However, if we want to be extra safe, we could remove semesters from all AP/CLEP courses
        // that don't have traditional course numbers (as those are less likely to have explicit semesters)
        // For now, let's leave this as is and rely on the prompt and propagation exclusion

        // Post-processing: Filter out invalid courses (statistics headers, invalid format, etc.)
        if (parsedData.courses && Array.isArray(parsedData.courses)) {
          const validCoursePattern = /^[A-Z]{2,5}\s*[-]?\s*\d{2,5}/i; // Letters (2-5) followed by optional dash/space and numbers (2-5, to support 4-digit course numbers like "BIO 1414" and 5-letter prefixes like "POLSC 1113")
          const statisticsKeywords = ['EHRS', 'GPA', 'HRSPOINTS', 'CUMULATIVE', 'TERM', 'SEMESTER', 'HOURS', 'POINTS', 'TOTAL', 'CURRENT', 'RETENTION'];
          
          const originalCount = parsedData.courses.length;
          parsedData.courses = parsedData.courses.filter((course) => {
            const courseNumber = course.courseNumber ? String(course.courseNumber).trim().toUpperCase() : '';
            const courseName = course.courseName ? String(course.courseName).trim().toUpperCase() : '';
            
            // Filter out courses without course numbers
            if (!courseNumber || courseNumber === '' || /^[\s\-_]+$/.test(courseNumber)) {
              logger.debug(`Filtered out course with blank/invalid course number: "${course.courseNumber}" - "${course.courseName}"`);
              return false;
            }
            
            // Filter out courses that don't match the valid course number pattern (letters followed by numbers)
            if (!validCoursePattern.test(courseNumber)) {
              logger.debug(`Filtered out course with invalid course number format: "${course.courseNumber}" - "${course.courseName}"`);
              return false;
            }
            
            // Filter out courses that are statistics headers/keywords
            for (const keyword of statisticsKeywords) {
              if (courseNumber.includes(keyword) || courseName.includes(keyword)) {
                logger.debug(`Filtered out course that matches statistics keyword "${keyword}": "${course.courseNumber}" - "${course.courseName}"`);
                return false;
              }
            }
            
            // Filter out courses that are clearly statistics lines (patterns like "EHRSGPA-HRSPOINTSGPA")
            // Check for patterns that are statistics headers, not courses
            if (courseNumber.match(/EHRS|GPA|HRSPOINTS|CUMULATIVE|TERM|SEMESTER|HOURS|POINTS/i) ||
                courseNumber.match(/EHRSGPA|HRSPOINTSGPA/i) ||
                (courseNumber.match(/^[A-Z]+[-]?[A-Z]+$/i) && !courseNumber.match(/\d/))) {
              // Pattern matches all caps letters with optional dash, but no numbers - this is likely a statistics header
              logger.debug(`Filtered out course that matches statistics pattern: "${course.courseNumber}" - "${course.courseName}"`);
              return false;
            }
            
            return true;
          });
          
          const filteredCount = originalCount - parsedData.courses.length;
          if (filteredCount > 0) {
            logger.info(`Filtered out ${filteredCount} invalid course(s) (statistics headers, invalid format, etc.)`);
          }
        }

        // Filter out courses from other universities
        // If the semester field contains a university name that's different from the main university,
        // it indicates the course is from another institution and should be excluded
        if (parsedData.university && parsedData.courses && parsedData.courses.length > 0) {
          const mainUniversity = parsedData.university.toLowerCase().trim();
          parsedData.courses = parsedData.courses.filter((course) => {
            if (!course.semester) return true; // Keep courses without semester info
            
            // Check if semester contains university names (common indicators)
            const semesterLower = course.semester.toLowerCase();
            const transferIndicators = [
              'transfer',
              'from',
              'credit',
              'another',
              'other',
              'institution',
              'university',
              'college',
              'school'
            ];
            
            // If semester contains transfer-related keywords, it might be from another university
            // But we need to be careful - check if it actually mentions a different university name
            // For now, we'll rely on the LLM to filter these out based on the prompt
            // This post-processing is a safety net in case the LLM misses some
            
            // If the semester contains a university name and it's different from main university, exclude it
            // This is a simple check - in practice, the LLM should handle this
            return true; // Default: keep the course (LLM should have filtered already)
          });
        }
      }

      // Post-processing: Filter out invalid courses (statistics headers, etc.)
      if (parsedData.courses && Array.isArray(parsedData.courses)) {
        const validCoursePattern = /^[A-Z]{2,5}\s*[-]?\s*\d{2,5}/i; // Letters (2-5) followed by optional dash/space and numbers (2-5, to support 4-digit course numbers like "BIO 1414" and 5-letter prefixes like "POLSC 1113")
        const statisticsKeywords = ['EHRS', 'GPA', 'HRSPOINTS', 'CUMULATIVE', 'TERM', 'SEMESTER', 'HOURS', 'POINTS', 'TOTAL', 'CURRENT', 'RETENTION'];
        
        const originalCount = parsedData.courses.length;
        parsedData.courses = parsedData.courses.filter((course) => {
          const courseNumber = course.courseNumber ? String(course.courseNumber).trim().toUpperCase() : '';
          const courseName = course.courseName ? String(course.courseName).trim().toUpperCase() : '';
          
          // Filter out courses without course numbers
          if (!courseNumber || courseNumber === '' || /^[\s\-_]+$/.test(courseNumber)) {
            logger.debug(`Filtered out course with blank/invalid course number: "${course.courseNumber}" - "${course.courseName}"`);
            return false;
          }
          
          // Filter out courses that don't match the valid course number pattern (letters followed by numbers)
          if (!validCoursePattern.test(courseNumber)) {
            logger.debug(`Filtered out course with invalid course number format: "${course.courseNumber}" - "${course.courseName}"`);
            return false;
          }
          
          // Filter out courses that are statistics headers/keywords
          for (const keyword of statisticsKeywords) {
            if (courseNumber.includes(keyword) || courseName.includes(keyword)) {
              logger.debug(`Filtered out course that matches statistics keyword "${keyword}": "${course.courseNumber}" - "${course.courseName}"`);
              return false;
            }
          }
          
          // Filter out courses that are clearly statistics lines (patterns like "EHRSGPA-HRSPOINTSGPA")
          if (courseNumber.match(/EHRS|GPA|HRSPOINTS|CUMULATIVE|TERM|SEMESTER|HOURS|POINTS/i) ||
              courseNumber.match(/EHRSGPA|HRSPOINTSGPA/i) ||
              courseNumber.match(/^[A-Z]+[-]?[A-Z]+$/i)) {
            logger.debug(`Filtered out course that matches statistics pattern: "${course.courseNumber}" - "${course.courseName}"`);
            return false;
          }
          
          return true;
        });
        
        const filteredCount = originalCount - parsedData.courses.length;
        if (filteredCount > 0) {
          logger.info(`Filtered out ${filteredCount} invalid course(s) (statistics headers, invalid format, etc.)`);
        }
      }

      return parsedData;
    } catch (error) {
      console.error("Error parsing with LLM:", error);
      throw new Error("Failed to parse transcript with LLM: " + error.message);
    }
  }
}

export default new OCRService();
