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
const require = createRequire(import.meta.url);

let pdfParseModule;
try {
  pdfParseModule = require("pdf-parse");
} catch (e) {
  console.error('Error requiring pdf-parse:', e);
  throw e;
}

let pdfParse;
if (typeof pdfParseModule === 'function') {
  pdfParse = pdfParseModule;
} else if (pdfParseModule && typeof pdfParseModule.default === 'function') {
  pdfParse = pdfParseModule.default;
} else {
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

      await execPromise(
        `sips -s format png --resampleHeightWidthMax 3000 "${tempPdfPath}" --out "${tempPngPath}"`
      );

      const imageBuffer = fs.readFileSync(tempPngPath);
      return imageBuffer;
    } finally {
      // Clean up temp files
      if (fs.existsSync(tempPdfPath)) {
        fs.unlinkSync(tempPdfPath);
      }
      if (fs.existsSync(tempPngPath)) {
        fs.unlinkSync(tempPngPath);
      }
    }
  }

  async extractTranscriptInfo(pdfBuffer) {
    logger.info("Starting transcript extraction");
    
    // Step 1: Try to extract text directly from PDF
    let promptText = "";
    try {
      promptText = await this.extractTextFromPDF(pdfBuffer);
      logger.info(`Extracted ${promptText.length} characters from PDF`);
    } catch (error) {
      logger.warn("PDF text extraction failed, trying OCR fallback");
      try {
        const imageBuffer = await this.convertPdfToImage(pdfBuffer);
        promptText = await this.performOCR(imageBuffer);
        logger.info(`Extracted ${promptText.length} characters via OCR`);
      } catch (ocrError) {
        logger.error("OCR fallback failed:", ocrError);
        throw new Error("Failed to extract text from PDF: " + ocrError.message);
      }
    }

    if (!promptText || promptText.trim().length === 0) {
      throw new Error("No text could be extracted from the PDF");
    }

    // Step 2: Extract transcript data using AI
    const extractedData = await this.extractTranscriptData(promptText);
    
    logger.info(`Extracted ${extractedData.semesters?.length || 0} semesters with courses`);
    
    return extractedData;
  }

  async extractTranscriptData(promptText) {
    const prompt = `
You are a transcript data extraction assistant. Extract structured data from a university transcript.

**GOAL**: Return JSON containing:
- university: The name of the university
- studentName: The student's name
- semesters: A list of "for credit" semesters, each containing courses

**🚨 CRITICAL EXAMPLE - 2 COLUMN TRANSCRIPT 🚨**:
If the transcript has 2 columns like this:
Column 1 (left side)          Column 2 (right side)
Fall 2023                     BIO 101 Introduction A 3
BIO 141 Biology A 3           CHEM 121 Chemistry B 4
CHEM 120 Chemistry A 3        Spring 2024
Spring 2024                   MATH 201 Calculus A 4
MATH 162 Calculus A 4         

**CORRECT EXTRACTION**:
- Column 1: "BIO 141" and "CHEM 120" → Fall 2023
- Column 1: "MATH 162" → Spring 2024
- **Column 2 FIRST COURSE**: "BIO 101" → Fall 2023 (uses last semester from column 1) ✓
- Column 2: "CHEM 121" → Fall 2023 (continues using last semester from column 1) ✓
- Column 2: "MATH 201" → Spring 2024 (new semester header in column 2) ✓

**WRONG**: Skipping "BIO 101" at the top of column 2 because there's no header above it ❌
**WRONG**: Assigning "BIO 101" to no semester ❌

**SEMESTER FORMAT**:
Semesters are designated by season and year:
- Spring (SP)
- Summer (SU)  
- Fall (FA)
- Winter (WN)

Format: "Spring 2023", "Fall 2022", "Summer 2024", etc.

**COURSE FORMAT**:
Courses have:
- courseNumber: Letters (2-5 letters) followed by space or dash, then 3-5 numbers
  Examples: "BIO 141", "POLSC 1113", "ENG-101", "MATH 1623"
  **CRITICAL - COURSE PATTERN RECOGNITION**: 
  * If you see text that starts with 2-5 letters, then space/dash, then 3-5 numbers, it's VERY LIKELY a course
  * This pattern can appear ANYWHERE - at the start of a column, middle, or end
  * **DO NOT SKIP** items matching this pattern just because they appear at the top of the second column or without a header above them
  * **EXAMPLE**: If second column starts with "BIO 101" → This is a course, extract it immediately ✓
- courseName: Description (can have multiple words, may end in Roman numerals I, II, III, IV, V). This field is REQUIRED - if no description is visible, use the course number or an empty string, but do NOT omit it
  Examples: "Introduction to Biology", "Calculus II", "American Federal Govt", ""
  **CRITICAL**: courseName is a required field - always include it, even if you have to use course number or empty string as fallback
  **🚨🚨🚨 CRITICAL - PRESERVE ALL SPACES BETWEEN WORDS 🚨🚨🚨**:
    * **MUST PRESERVE**: All spaces between words in course names exactly as they appear in the transcript
    * **EXAMPLE - CORRECT**: If transcript shows "Introduction to Biology" → Extract as "Introduction to Biology" (with spaces) ✓
    * **EXAMPLE - WRONG**: If transcript shows "Introduction to Biology" → Extracting as "IntroductiontoBiology" (no spaces) ❌
    * **EXAMPLE - CORRECT**: If transcript shows "American Federal Govt" → Extract as "American Federal Govt" (with spaces) ✓
    * **EXAMPLE - WRONG**: If transcript shows "American Federal Govt" → Extracting as "AmericanFederalGovt" (no spaces) ❌
    * **DO NOT**: Remove spaces between words
    * **DO NOT**: Collapse multiple spaces into single spaces (unless they're truly multiple spaces in the original)
    * **DO**: Keep exactly the same spacing as appears in the transcript text
    * **VERIFICATION**: Before including a courseName in JSON, check: "Did I preserve all the spaces between words?"
- grade: One or more letters with no spaces (appears after course description)
  Examples: "A", "B+", "S", "P", "F", "W", "U"
  **CRITICAL - GRADE EXTRACTION RULES**:
  * The grade typically appears on the same line as the course, after the course name
  * Look for letter grades (A, B, C, D, F) with optional + or - (e.g., "A+", "B-")
  * Look for pass/fail grades (S, P, W, U)
  * The grade may appear immediately after the course name with no space, or separated by spaces
  * If a single letter appears after the course name and it's a valid grade letter, extract it
  * **VERY IMPORTANT**: Extract grades for ALL courses - check every course line for a grade
  * If no grade is visible after careful examination, use null or empty string
  * Do NOT skip grade extraction - actively look for grades on every course line
- hours: Credit hours (number). If not visible or cannot be determined, use 0
  Examples: 3, 4, 1, 0
  **IMPORTANT**: Hours value does NOT affect semester assignment. Assign semesters based on course position only, regardless of hours value (0, null, or any number)

**SECTION HEADERS**:
Transcripts contain section headers that determine what to extract:

1. **Advanced Placement or CLEP**:
   - Headers like "Advanced Placement", "AP", "CLEP", "Advanced Credit"
   - **EXTRACT** all courses in this section
   - These courses typically don't have semesters (put in coursesWithoutSemester)
   - **CRITICAL - GRADE FOR AP/CLEP COURSES**: 
     * If a grade is visible for an AP/CLEP course, extract it exactly as shown
     * If NO grade is visible for an AP/CLEP course, use "S" (Satisfactory) as the default grade
     * "S" is the standard grade for Advanced Placement and CLEP courses when no grade is shown
     * **EXAMPLE**: If you see "AP Biology" with no grade visible → grade = "S"
     * **EXAMPLE**: If you see "AP Chemistry" with grade "A" visible → grade = "A" (use the visible grade)

2. **Transfer Credit**:
   - **🚨🚨🚨 CRITICAL - ANY HEADER CONTAINING "TRANSFER" (in any case) IS A TRANSFER HEADER 🚨🚨🚨**:
     * Headers like "Transfer Credit", "TRANSFER CREDIT ACCEPTED BY THE INSTITUTION:", "2022 Fall - Transfer", "Fall 2022 Transfer", "Transfer - Fall 2022"
     * **IF A HEADER CONTAINS THE WORD "TRANSFER" (or "TRANSFER" in uppercase), IT IS A TRANSFER HEADER - regardless of what else it contains (even if it has a semester like "2022 Fall")**
     * **EXAMPLE**: "2022 Fall - Transfer" → This is a TRANSFER header, NOT a semester header
     * **EXAMPLE**: "Fall 2022 Transfer" → This is a TRANSFER header, NOT a semester header
     * **EXAMPLE**: "Transfer Credit" → This is a TRANSFER header
   - **🚨🚨🚨 ABSOLUTE RULE: DO NOT EXTRACT ANY COURSES AFTER ANY HEADER CONTAINING "TRANSFER" 🚨🚨🚨**:
     * When you see ANY header with "Transfer" in it, IMMEDIATELY STOP extracting courses
     * Do NOT extract semesters or courses that appear after ANY header containing "Transfer"
     * Skip ALL content (courses, semesters, everything) after Transfer Credit headers
     * Continue skipping until you see "Institutional Credit" or "Advanced Credit/CLEP"
     * **VERY IMPORTANT**: Even if a transfer header looks like it has semester information (e.g., "2022 Fall - Transfer"), it is STILL a transfer header - do NOT extract courses after it
     * **DO NOT** put courses after transfer headers in your JSON output - they should be completely omitted

3. **Institutional Credit**:
   - Headers like "Institutional Credit", "Institution Credit"
   - **EXTRACT** all courses in this section
   - These courses should have semesters assigned

**PATTERN**:
The transcript follows this hierarchical pattern:
- Header (section header like "Advanced Placement", "Transfer Credit", "Institutional Credit")
  - Semester (multiple semesters within the header section)
    - Course (multiple courses within each semester section)

**COLUMN HANDLING**:
- Transcripts may have 1 or 2 columns
- If 2 columns: Process first column (left) completely from top to bottom, then second column (right) completely from top to bottom

**🚨 STEP-BY-STEP PROCESS FOR 2-COLUMN TRANSCRIPTS 🚨**:
1. **Identify column boundaries**: Look for text that appears side-by-side or clear separation between left and right columns
2. **Process first column**: Extract all courses from top to bottom of the left column
3. **Track last semester**: Remember the last semester header you saw in the first column
4. **Locate second column start**: Find where the second column begins (usually at the same vertical position as the first column start, but on the right side)
5. **🚨🚨🚨 CRITICAL - SECOND COLUMN FIRST ITEM 🚨🚨🚨**:
   * When you find the start of the second column, look at the FIRST line/item
   * If it matches a course pattern (has course number like "BIO 101", "MATH 1623", etc.), it IS a course
   * **DO NOT SKIP IT** - extract it immediately as a course
   * Assign it to the last semester from the first column
   * **COMMON MISTAKE**: The first item in the second column might not have a header above it, but it's still a course - extract it anyway
6. **Continue extracting**: After extracting the first course, continue extracting all courses down the second column
7. **Update semester**: When you see a new semester header in the second column, switch to that semester for subsequent courses

- **CRITICAL - EXTRACT ALL COURSES**: You MUST extract ALL courses in each column, including:
  - **THE VERY FIRST COURSE AT THE TOP OF THE SECOND COLUMN** ← THIS IS OFTEN MISSED!
  - Courses at the top of columns
  - Courses in the middle of columns
  - Courses at the bottom of columns (VERY IMPORTANT - do not stop early)
  - Courses after the last semester header in a column
- If multiple pages: First column of page 2 follows second column of page 1
- **DO NOT STOP EXTRACTING**: Continue extracting courses until you reach the end of the document/column, even if you've already seen many courses
- **🚨 CRITICAL - SEMESTER CONTINUITY BETWEEN COLUMNS 🚨**:
  * When you finish processing the first column and start processing the second column, the semester context CONTINUES
  * **🚨🚨🚨 YOU MUST EXTRACT THE FIRST COURSE(S) IN THE SECOND COLUMN 🚨🚨🚨**:
    * When you begin processing the second column, IMMEDIATELY start extracting courses from the very top
    * The first course at the top of the second column is JUST AS IMPORTANT as any other course
    * Do NOT skip courses at the beginning of the second column - extract them immediately
    * **VERIFICATION**: When you finish, check: "Did I extract the first course at the top of the second column?"
  * **The first course in the second column should be assigned to the last semester heading that appeared in the first column**
  * **EXAMPLE**: If first column ends with "Fall 2023" header followed by courses, then second column starts with "BIO 101":
    - **CORRECT**: Extract "BIO 101" and assign it to "Fall 2023" semester ✓
    - **WRONG**: Skip "BIO 101" because it's at the top of the second column ❌
    - **WRONG**: Extract "BIO 101" but assign it to no semester or wrong semester ❌
  * This is because the second column is a continuation of the same transcript - semester headers apply across columns until a new semester header appears in the second column
  * **RULE**: Track the last semester header from the first column, and use it for the first course(s) in the second column until you see a new semester header in the second column
  * **IMPORTANT**: Start extracting courses from the very first line of the second column - don't wait for a header, don't skip anything

**EXTRACTION RULES**:
1. Extract university name and student name from the top of the transcript
2. Identify section headers (Advanced Placement/CLEP, Transfer Credit, Institutional Credit)
3. For each section:
   - **🚨 CRITICAL - TRANSFER HEADER DETECTION 🚨**: 
     * If ANY header contains the word "Transfer" (in any case - "Transfer", "TRANSFER", "transfer"), it is a TRANSFER header
     * **DO NOT EXTRACT** courses after transfer headers, even if the header also contains semester information (e.g., "2022 Fall - Transfer")
     * Skip all courses after transfer headers until you see "Institutional Credit" or "Advanced Credit/CLEP"
     * **EXAMPLE**: Header "2022 Fall - Transfer" → This is a TRANSFER header, NOT a semester header → Skip all courses after it
   - If "Transfer Credit" (or any header with "Transfer"): Skip all courses until next section header
   - If "Advanced Placement/CLEP" or "Institutional Credit": Extract courses
4. For courses in "Institutional Credit" sections:
   - Identify semester headers (Spring, Summer, Fall, Winter + year)
   - **🚨 CRITICAL**: A semester header should NOT contain the word "Transfer" - if it does, it's a transfer header, not a semester header
   - **EXAMPLE**: "Fall 2022" → Valid semester header ✓
   - **EXAMPLE**: "2022 Fall - Transfer" → NOT a semester header, it's a transfer header → Skip courses after it ❌
   - Assign courses to the most recent semester header that appears before them
   - **🚨 CRITICAL - COLUMN TRANSITION**: When processing 2 columns:
     * Track the last semester header from the first column as you process it
     * **🚨🚨🚨 IMMEDIATELY START EXTRACTING COURSES FROM THE TOP OF THE SECOND COLUMN 🚨🚨🚨**:
       * When you begin the second column, the FIRST item(s) you see are likely courses - extract them immediately
       * Do NOT skip courses at the top of the second column
       * The first course in the second column is just as important as courses in the middle or bottom
       * **EXAMPLE**: Second column starts with "BIO 101 Introduction to Biology A 3" → Extract it immediately, assign to last semester from first column
     * When you start processing the second column, use that last semester header for the first course(s) in the second column
     * Continue using that semester header until you see a new semester header in the second column
     * **EXAMPLE**: First column ends with "Fall 2023" → Second column first course "BIO 101" → Extract "BIO 101" and assign to "Fall 2023" ✓
   - **CRITICAL**: Hours value (0, null, or any number) does NOT affect semester assignment
   - Courses with 0 hours or no hours still get assigned to semesters based on position
   - **CRITICAL - EXTRACT ALL COURSES**: Extract ALL courses after each semester header, including:
     * Courses immediately after the header
     * Courses in the middle of the semester section
     * Courses at the bottom of the column after the last semester header
     * Do NOT stop extracting when you see a few courses - continue until the end of the column
   - If course appears before first semester header: put in coursesWithoutSemester
5. For courses in "Advanced Placement/CLEP" sections:
   - Typically no semesters - put in coursesWithoutSemester

**CRITICAL RULES**:
- **🚨🚨🚨 DO NOT EXTRACT COURSES AFTER ANY HEADER CONTAINING "TRANSFER" 🚨🚨🚨**:
  * If a header contains the word "Transfer" (in any case), it is a TRANSFER header
  * **DO NOT** extract courses after transfer headers, even if the header includes semester information
  * **EXAMPLES OF TRANSFER HEADERS** (do NOT extract courses after these):
    - "Transfer Credit"
    - "TRANSFER CREDIT ACCEPTED BY THE INSTITUTION:"
    - "2022 Fall - Transfer" ← Even though it has "2022 Fall", it's still a transfer header
    - "Fall 2022 Transfer" ← Even though it has "Fall 2022", it's still a transfer header
    - "Transfer - Fall 2022" ← Even though it has "Fall 2022", it's still a transfer header
  * **VERY IMPORTANT**: Headers like "2022 Fall - Transfer" are TRANSFER headers, NOT semester headers
  * Skip all courses after transfer headers until you see "Institutional Credit" or "Advanced Credit/CLEP"
- **DO** extract courses after "Advanced Placement/CLEP" and "Institutional Credit" headers
- Courses get semesters from the most recent semester header before them
- **🚨 CRITICAL - 2 COLUMN SEMESTER ASSIGNMENT 🚨**:
  * When processing 2 columns, semester context CONTINUES from first column to second column
  * **🚨🚨🚨 YOU MUST EXTRACT THE FIRST COURSE(S) AT THE TOP OF THE SECOND COLUMN 🚨🚨🚨**:
    * When you start processing the second column, IMMEDIATELY extract the first course(s) you see
    * Do NOT skip courses at the top of the second column - they are just as important as any other course
    * The first course in the second column does NOT need a new semester header - use the last semester from the first column
  * The first course in the second column should be assigned to the last semester heading from the first column
  * Continue using that semester header for courses in the second column until a new semester header appears in the second column
  * **EXAMPLE**: First column ends with "Fall 2023" → Second column starts with "BIO 101 Introduction to Biology" → Extract "BIO 101" immediately and assign to "Fall 2023" ✓
  * **WRONG**: First column ends with "Fall 2023" → Second column starts with "BIO 101" → Skip it because there's no header yet ❌
- **HOURS DO NOT AFFECT SEMESTER ASSIGNMENT**: Whether a course has 0 hours, 3 hours, or any other value, assign semesters based solely on the course's position relative to semester headers
- **DO NOT** skip semester assignment for courses with 0 hours or missing hours - assign semesters based on position only
- **🚨🚨🚨 CRITICAL - EXTRACT ALL COURSES TO THE END 🚨🚨🚨**:
  * You MUST extract ALL courses in the transcript, including courses at the very bottom of columns
  * Do NOT stop extracting early - continue until you reach the end of the document
  * If you see a semester header near the bottom of a column, extract ALL courses that appear after it
  * Courses at the bottom of the second column are just as important as courses at the top
  * **VERIFICATION**: Before finishing, check: 
    - "Did I extract all courses from the bottom of each column?"
    - "Did I extract the first course(s) at the TOP of the second column?" ← CRITICAL CHECK
  * **EXAMPLE - SECOND COLUMN TOP** (2-column transcripts):
    - If second column starts with "BIO 101 Introduction to Biology A 3" at the very top
    - **CORRECT**: Extract "BIO 101" immediately and assign to last semester from first column ✓
    - **WRONG**: Skip "BIO 101" because you think it needs a header first ❌
    - **WRONG**: Only extract courses after you see a semester header in the second column ❌
  * **EXAMPLE - SECOND COLUMN BOTTOM**:
    - If second column has: [many courses], then "Fall 2025" header near bottom, then "BIO 499" course at the very bottom
    - **CORRECT**: Extract "BIO 499" and assign it to "Fall 2025" semester ✓
    - **WRONG**: Stopping extraction before "BIO 499" because it's at the bottom ❌
  * **EXAMPLE - LAST SEMESTER IN COLUMN**:
    - If you see "Spring 2025" header at the bottom of second column, followed by courses
    - Extract ALL courses after "Spring 2025", even if they're the last items in the column
    - Do NOT assume extraction is complete - check if there are more courses after the last header

**OUTPUT FORMAT**:
Return ONLY valid JSON (no markdown):

{
  "university": "string",
  "studentName": "string",
  "semesters": [
    {
      "semester": "Spring 2023" (format: "Season Year"),
      "courses": [
      {
        "courseNumber": "BIO 141",
        "courseName": "Introduction to Biology",
        "grade": "A",
        "hours": 3
      }
      ]
    }
  ],
  "coursesWithoutSemester": [
      {
        "courseNumber": "AP Biology",
        "courseName": "Advanced Placement Biology",
        "grade": "S",
        "hours": 0
      }
  ]
}

**IMPORTANT**:
- Semester format: "Spring 2023", "Fall 2022", "Summer 2024", "Winter 2023"
- Course numbers: Extract complete number including all letters and digits
- Course names: Include all words, preserve Roman numerals (I, II, III, IV, V), **🚨 CRITICAL: PRESERVE ALL SPACES BETWEEN WORDS** exactly as they appear in the transcript - do NOT remove spaces between words (e.g., "Introduction to Biology" NOT "IntroductiontoBiology")
- Grades: Extract exactly as shown (A, B+, S, P, F, etc.). If no grade is visible after careful examination, use null or empty string
- **🚨🚨🚨 CRITICAL - GRADE EXTRACTION IS MANDATORY 🚨🚨🚨**:
  * You MUST extract grades for ALL courses
  * Check every course line carefully for a grade - it usually appears after the course name
  * Grades can be: A, A+, A-, B, B+, B-, C, C+, C-, D, D+, D-, F, S, P, W, U, etc.
  * The grade may appear immediately after the course name or separated by spaces
  * Look at the end of each course line - grades are typically there
  * **VERIFICATION**: For each course you extract, ask: "Did I look for and extract the grade?" If NO, go back and check again
  * **COMMON PATTERN**: Course line typically looks like: "BIO 141 Introduction to Biology A" or "BIO 141 Introduction to Biology  A" (grade at end)
  * Do NOT skip grade extraction - it's a required step for every course
  * Only use null/empty if you've carefully examined the line and confirmed no grade is present
- **🚨🚨🚨 ABSOLUTE RULE: Do NOT include courses from Transfer Credit sections 🚨🚨🚨**:
  * If you see ANY header containing "Transfer" (in any case), do NOT include ANY courses that appear after it in your JSON output
  * This includes headers like "2022 Fall - Transfer" - even though it has semester info, it's still a transfer header
  * Transfer courses should be completely omitted from your JSON response

**🚨 CRITICAL - HOURS DO NOT AFFECT SEMESTER ASSIGNMENT 🚨**:
- **HOURS VALUE IS IRRELEVANT FOR SEMESTER ASSIGNMENT**: Whether a course has 0 hours, 3 hours, 4 hours, or no hours visible, you MUST assign it to a semester based ONLY on its position relative to semester headers
- **EXAMPLE**: If you see "Fall 2022" header, then course "BIO 141" with 0 hours, then course "CHEM 121" with 3 hours:
  - Both courses get "Fall 2022" semester - the hours value (0 vs 3) does NOT matter
- **EXAMPLE**: If you see course "BIO 101" with 0 hours appearing after "Fall 2022" header:
  - Course gets "Fall 2022" semester - assign it to the semester based on position, not hours
- **DO NOT**: Skip semester assignment for courses with 0 hours
- **DO NOT**: Put courses with 0 hours in coursesWithoutSemester if they appear after a semester header
- **DO**: Assign ALL courses to semesters based on their position relative to semester headers, regardless of hours value

**🚨🚨🚨 FINAL VALIDATION CHECKLIST - BEFORE RETURNING JSON 🚨🚨🚨**:
Before you return the JSON, you MUST verify:
1. ✅ Did I extract the first course at the TOP of the second column? (If 2 columns)
   - Look at where the second column starts
   - If there's text matching a course pattern (letters + space/dash + numbers) at the start of the second column, extract it
   - This is the #1 most commonly missed course!
2. ✅ Did I extract all courses from the bottom of each column?
3. ✅ Did I assign the first course in the second column to the last semester from the first column?
4. ✅ Did I extract grades for ALL courses?
5. ✅ **Did I preserve spaces between words in course names?**
   - Check each courseName in the JSON
   - Verify that multi-word course names have spaces between words
   - **EXAMPLE**: "Introduction to Biology" should have spaces, NOT "IntroductiontoBiology"
   - If any course names are missing spaces between words, go back and fix them
6. ✅ **🚨🚨🚨 CRITICAL CHECK: Did I avoid extracting courses from Transfer Credit sections? 🚨🚨🚨**
   - **STEP 1**: Search the entire transcript text for ANY header containing the word "Transfer" (case-insensitive)
   - **STEP 2**: For EACH transfer header found:
     * Note its position in the transcript
     * Identify where the next section starts (Institutional Credit, Advanced Credit/CLEP, or end of document)
     * **VERIFY**: Did I extract ANY courses that appear between the transfer header and the next section?
     * **If YES**: Remove those courses from the JSON immediately!
   - **VERY IMPORTANT**: Did I check headers that include semester info like "2022 Fall - Transfer"? These are TRANSFER headers, NOT semester headers!
   - **VERY IMPORTANT**: "2022 Fall - Transfer" = TRANSFER header → Do NOT extract courses after it!
   - **FINAL CHECK**: Before returning JSON, manually verify: "Are there any courses in my output that came from after a transfer header?" If yes, remove them!

**IF THE TRANSCRIPT HAS 2 COLUMNS, YOU MUST CHECK**: What is the first line/item in the second column? If it matches a course pattern, did I extract it? If not, go back and extract it now!

${promptText}
`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const textResponse = response.text();

      logger.debug("Gemini Response:", textResponse);

      // Clean up the response to ensure it's valid JSON
      let jsonStr = textResponse
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim();

      const parsedData = JSON.parse(jsonStr);

      // Post-processing: Ensure hours defaults to 0 if null/undefined
      // Process courses in semesters FIRST (before creating flat array)
      if (parsedData.semesters && Array.isArray(parsedData.semesters)) {
        parsedData.semesters.forEach((semesterObj) => {
          if (semesterObj.courses && Array.isArray(semesterObj.courses)) {
            semesterObj.courses.forEach((course) => {
              if (course.hours === null || course.hours === undefined || isNaN(course.hours)) {
                course.hours = 0;
              } else {
                course.hours = parseFloat(course.hours) || 0;
              }
            });
          }
        });
      }
      
      // Process coursesWithoutSemester
      if (parsedData.coursesWithoutSemester && Array.isArray(parsedData.coursesWithoutSemester)) {
        parsedData.coursesWithoutSemester.forEach((course) => {
          if (course.hours === null || course.hours === undefined || isNaN(course.hours)) {
            course.hours = 0;
          } else {
            course.hours = parseFloat(course.hours) || 0;
          }
        });
      }
      
      // Convert to flat format for compatibility with existing code
      const allCourses = [];
      
      // Add courses from semesters (hours already fixed above)
      if (parsedData.semesters && Array.isArray(parsedData.semesters)) {
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
      }
      
      // Add courses without semester (hours already fixed above)
      if (parsedData.coursesWithoutSemester && Array.isArray(parsedData.coursesWithoutSemester)) {
        parsedData.coursesWithoutSemester.forEach((course) => {
          allCourses.push({
            ...course,
            semester: null
          });
        });
      }
      
      // Set the flat courses array
      parsedData.courses = allCourses;
      
      // Post-processing: Ensure required fields are properly set
      parsedData.courses.forEach((course) => {
        // Ensure courseName (courseDescription) is never null - use empty string if missing
        // Preserve all spaces (including internal spaces) - only trim leading/trailing whitespace if needed
        if (!course.courseName || course.courseName === null || course.courseName === undefined) {
          course.courseName = '';
        } else {
          // Convert to string and only trim leading/trailing whitespace (preserves internal spaces)
          course.courseName = String(course.courseName).trim();
          // Note: .trim() only removes leading/trailing spaces, internal spaces are preserved
        }
        
        // Determine if this is an AP/CLEP course
        const courseName = (course.courseName || '').toLowerCase();
        const courseNumber = (course.courseNumber || '').toLowerCase();
        const isAPCLEP = courseName.includes('advanced placement') || 
                        courseName.includes('ap ') || 
                        courseName.startsWith('ap ') ||
                        courseName.includes('clep') ||
                        courseNumber.includes('ap') || 
                        courseNumber.includes('clep') ||
                        courseName.includes('advanced credit');
        
        // Ensure grade is properly set
        if (course.grade === undefined || course.grade === null || (typeof course.grade === 'string' && course.grade.trim() === '')) {
          // If it's an AP/CLEP course and has no grade, default to "S" (Satisfactory)
          if (isAPCLEP) {
            course.grade = 'S';
            logger.debug(`Set grade to "S" for AP/CLEP course without grade: "${course.courseNumber} ${course.courseName}"`);
          } else {
            course.grade = null;
          }
        } else {
          // Ensure grade is a string and trim it
          course.grade = String(course.grade).trim();
          // If it's empty after trimming, handle based on course type
          if (course.grade === '') {
            if (isAPCLEP) {
              course.grade = 'S';
              logger.debug(`Set grade to "S" for AP/CLEP course with empty grade: "${course.courseNumber} ${course.courseName}"`);
            } else {
              course.grade = null;
            }
          }
        }
      });
      
      // Post-processing: Filter out Transfer Credit courses (safeguard)
      // Match ANY header containing "transfer" (case-insensitive), including those with semester info
      const transferHeaderPatterns = [
        /transfer\s+credit/gi,
        /transfer\s+credit\s+accepted/gi,
        /\d{4}\s+(fall|spring|summer|winter|fa|sp|su|wn)\s*[-–—]\s*transfer/gi,  // "2022 Fall - Transfer"
        /(fall|spring|summer|winter|fa|sp|su|wn)\s+\d{4}\s*[-–—]?\s*transfer/gi,  // "Fall 2022 - Transfer" or "Fall 2022 Transfer"
        /transfer\s*[-–—]?\s*(fall|spring|summer|winter|fa|sp|su|wn)\s+\d{4}/gi   // "Transfer - Fall 2022" or "Transfer Fall 2022"
      ];
      
      const transferHeaderPositions = [];
      transferHeaderPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(promptText)) !== null) {
          transferHeaderPositions.push({
            position: match.index,
            text: match[0],
            endPosition: match.index + match[0].length
          });
        }
      });
      
      if (transferHeaderPositions.length > 0) {
        logger.warn(`Found ${transferHeaderPositions.length} Transfer Credit header(s) - filtering courses`);
        const firstTransferPosition = Math.min(...transferHeaderPositions.map(t => t.position));
        
        // Try to find reset headers
        const institutionalCreditPatterns = [
          /institutional\s+credit/gi,
          /institution\s+credit/gi,
          /advanced\s+credit/gi,
          /advanced\s+placement/gi,
          /clep/gi
        ];
        
        let resetPosition = promptText.length;
        institutionalCreditPatterns.forEach(pattern => {
          let match;
          while ((match = pattern.exec(promptText)) !== null) {
            if (match.index > firstTransferPosition && match.index < resetPosition) {
              resetPosition = match.index;
            }
          }
        });
        
        const transferSectionText = promptText.substring(firstTransferPosition, resetPosition).toLowerCase();
        
        logger.debug(`Transfer section text length: ${transferSectionText.length}, from position ${firstTransferPosition} to ${resetPosition}`);
        
        // Filter courses that appear in transfer section
        const beforeFilter = parsedData.courses.length;
        parsedData.courses = parsedData.courses.filter((course) => {
          const courseName = (course.courseName || '').toLowerCase().trim();
          const courseNumber = (course.courseNumber || '').toLowerCase().trim();
          
          // Keep AP/CLEP courses - these should be extracted even if they appear near transfer sections
          if (courseName.includes('ap ') || courseName.includes('clep') || 
              courseNumber.includes('ap') || courseNumber.includes('clep') ||
              courseName.includes('advanced placement') || courseName.includes('advanced credit')) {
            return true;
          }
          
          // Check if course number appears in transfer section (more aggressive matching)
          if (courseNumber && courseNumber.trim()) {
            // Try multiple pattern variations
            const normalizedCourseNumber = courseNumber.replace(/[\s-]/g, '');
            const patterns = [
              new RegExp(`\\b${courseNumber.replace(/[-\s]/g, '[\\s-]*')}\\b`, 'i'),
              new RegExp(`\\b${normalizedCourseNumber}\\b`, 'i'),
              new RegExp(courseNumber.replace(/([A-Z])/g, '$1[\\s-]*'), 'i'),
              // Also try with case-insensitive matching
              new RegExp(courseNumber.replace(/[-\s]/g, '[\\s-]*'), 'i')
            ];
            
            for (const pattern of patterns) {
              if (pattern.test(transferSectionText)) {
                logger.warn(`Removing Transfer course (course number match): "${course.courseNumber} ${course.courseName}"`);
                return false;
              }
            }
          }
          
          // Also check if course name appears in transfer section (if course name is substantial)
          if (courseName && courseName.trim() && courseName.length > 3) {
            // Look for course name words in transfer section
            const courseNameWords = courseName.split(/\s+/).filter(word => word.length > 2);
            if (courseNameWords.length > 0) {
              // Check if multiple words from course name appear in transfer section
              let matches = 0;
              for (const word of courseNameWords.slice(0, 3)) { // Check first 3 words
                if (transferSectionText.includes(word)) {
                  matches++;
                }
              }
              // If 2+ words match, likely a transfer course
              if (matches >= 2) {
                logger.warn(`Removing Transfer course (course name match): "${course.courseNumber} ${course.courseName}"`);
                return false;
              }
            }
          }
          
          return true;
        });
        
        const removedCount = beforeFilter - parsedData.courses.length;
        if (removedCount > 0) {
          logger.warn(`Removed ${removedCount} courses that appeared after Transfer headers`);
        }
      }

      return parsedData;
    } catch (error) {
      logger.error("Error parsing transcript with LLM:", error);
      
      // Check for specific Gemini API errors
      if (error.message && error.message.includes('503')) {
        throw new Error("The AI service is currently overloaded. Please wait a moment and try again. If the problem persists, try again in a few minutes.");
      } else if (error.message && error.message.includes('429')) {
        throw new Error("Too many requests to the AI service. Please wait a moment and try again.");
      } else if (error.message && error.message.includes('overloaded')) {
        throw new Error("The AI service is currently overloaded. Please wait a moment and try again. If the problem persists, try again in a few minutes.");
      }
      
      throw new Error("Failed to parse transcript with AI: " + (error.message || "Unknown error occurred"));
    }
  }
}

export default new OCRService();
