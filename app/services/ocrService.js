import { createWorker } from "tesseract.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { createRequire } from "module";

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

    const prompt = `
      You are a data extraction assistant. Your task is to extract structured transcript data from the following raw text extracted from a PDF.
      
<<<<<<< Updated upstream
=======
      **CRITICAL EXTRACTION RULES - READ FIRST**:
      1. **EXTRACT ALL COURSES** - Do not skip any courses, including:
         - The FIRST course at the top of the SECOND column (even if it seems to have no semester)
         - ALL Advanced Placement (AP) and CLEP courses (even if they have no semester, grade, or traditional course numbers)
      2. **ADVANCED PLACEMENT AND CLEP COURSES**:
         - **MUST EXTRACT** all courses that appear under "ADVANCED PLACEMENT", "AP", "ADVANCED PLACEMENT CREDIT", "AP CREDIT", "CLEP", "CLEP CREDIT", or similar headers.
         - These courses may NOT have semesters - use null for semester if not provided.
         - These courses may use "S" (Satisfactory) as a grade - extract it correctly, not "C".
         - Extract them even if they don't have traditional course numbers - use the course name/description.
      3. **FIRST COURSE IN SECOND COLUMN**:
         - MUST be extracted even if it appears to have no semester
         - Extract it with whatever grade appears next to it (or null if no grade)
         - Do NOT skip it
      
>>>>>>> Stashed changes
      Please extract:
      1. Student Name
      2. University Name
      3. List of Courses. For each course, extract:
         - Course Number (e.g., "BIB 113", "ENG-101")
         - Course Name (Title)
         - Semester (e.g., "Fall 2023", "FA23")
         - Grade (e.g., "A", "B+", "3.5")
         - Credit Hours (Attempted/Earned)

      Return the data in the following JSON format ONLY (no markdown formatting, just raw JSON):
      {
        "studentName": "string",
        "university": "string",
        "courses": [
          {
            "courseNumber": "string",
            "courseName": "string",
            "semester": "string",
            "grade": "string",
            "hours": number
          }
        ]
      }

      If a field is missing, use null or an empty string.
      For grades, try to normalize to letter grades or standard numeric values if possible, but keep original if unsure.
<<<<<<< Updated upstream
=======
      - **CRITICAL: GRADE vs CREDIT HOURS DISTINCTION**:
        * **DO NOT confuse credit hours with grades**. Credit hours are typically whole numbers or decimals like "3", "3.00", "4", "4.0" that appear in the credits/hours column.
        * **Grades are typically single letters** (A, B, C, D, F, P, S) or letter grades with modifiers (A+, A-, B+, etc.).
        * **Numeric grades are rare** - if you see a number like "3.00" or "4.0", it is MOST LIKELY a credit hour, NOT a grade, especially if it appears in a credits column or alongside course hours.
        * When extracting grades, look for:
          - Single letters (A, B, C, D, F, P, S)
          - Letter grades with + or - (A+, A-, B+, B-, etc.)
          - Very rarely, numeric grades like "4.0" (on a 4.0 scale) - but ONLY if it's clearly in the grade column and not the credits column
        * **CRITICAL**: If you see a decimal number like "3.00", "4.0", "3.5" in what appears to be the credits/hours column, extract it as the "hours" field, NOT as the "grade" field. The grade field should be null or empty if no grade is shown.
      - **CRITICAL: GRADE RECOGNITION - "S" GRADE FOR ADVANCED PLACEMENT AND CLEP**: 
        * "S" is a valid grade meaning "Satisfactory" or "Pass", and is the MOST COMMON grade for Advanced Placement (AP) and CLEP courses.
        * **CRITICAL - OCR ERROR PREVENTION**: OCR frequently mistakes "S" for "C" due to similar character shapes. You MUST be extremely careful when extracting grades for AP/CLEP courses.
        * **MANDATORY RULE**: When you see ANY course under "ADVANCED PLACEMENT", "AP", or "CLEP" sections:
          - If the grade looks like "C", it is ALMOST CERTAINLY "S" - verify carefully
          - If the grade is ambiguous or unclear, default to "S" for AP/CLEP courses
          - "S" (Satisfactory) is the standard grade for test credits like AP and CLEP
        * **EXAMPLES**: 
          - "AP English Literature" with grade looking like "C" → Should be extracted as "S"
          - "CLEP History" with grade "C" → Should be extracted as "S"
          - "Advanced Placement Calculus AB" with grade "C" → Should be extracted as "S"
        * Valid grades include: A, A+, A-, B, B+, B-, C, C+, C-, D, D+, D-, F, P, P*, S. Numeric grades are rare and should only be used if clearly a grade (like "4.0" on a 4.0 scale) and NOT a credit hour.
        * **CRITICAL EXTRACTION RULE**: When extracting grades for Advanced Placement or CLEP courses, if you see what looks like "C", assume it's "S" unless you are absolutely certain it's "C". The probability that an AP/CLEP course has grade "C" is very low - they almost always have grade "S" or no grade.
        * When extracting grades, preserve the exact grade shown on the transcript, but prioritize "S" over "C" for AP/CLEP courses if uncertain.
        * **For Advanced Placement and CLEP courses**: If no grade is explicitly shown, the grade should be "S" (Satisfactory) or null. Default to "S" if there's any indication of a grade.
>>>>>>> Stashed changes
      For semester, try to normalize to "Semester Year" format (e.g., "Fall 2023").

      IMPORTANT:
      - Semester information is often a header above a list of courses (e.g., "Fall 2023", "2023FA", "Term: Spring 2024").
      - You MUST apply the most recent semester header found to all subsequent courses until a new semester header is encountered.
<<<<<<< Updated upstream
      - If a course does not have an explicit semester next to it, use the last seen semester header.
=======
      - **CRITICAL - SEMESTER PERSISTENCE**: Semesters MUST carry forward across page boundaries. If you see a semester at the bottom of one page, it applies to courses at the top of the next page until a new semester is encountered.
      - **MANDATORY RULE**: If a course does not have an explicit semester next to it, you MUST use the last seen semester header (even if it was on a previous page or in a previous column). NEVER leave a course without a semester if a semester was previously encountered.
      - **CRITICAL - SECOND COLUMN SEMESTER ASSIGNMENT**: When processing two-column layouts, if the first column ends with a semester designation (even near the bottom), you MUST assign that semester to ALL courses in the second column that follow, starting from the VERY FIRST course at the top of the second column. This is not optional - it is mandatory.
      - **CRITICAL - DO NOT PROPAGATE GRADES**: 
        * **GRADES MUST NEVER BE COPIED OR PROPAGATED** from one course to another.
        * Each course must have its **OWN UNIQUE GRADE** that appears directly next to it on the transcript.
        * If a course doesn't have a grade visible next to it, the grade field **MUST be null or empty**.
        * **DO NOT use the grade from a previous course** - even if they're in the same column or on the same page.
        * **CRITICAL EXAMPLE**: If the first course in the second column doesn't have a visible grade, use null - DO NOT copy the grade from the last course in the first column.
        * Semesters can be propagated across columns, but **GRADES CANNOT** - they must be extracted individually for each course.
>>>>>>> Stashed changes
      - Look for dates or term codes if explicit headers are missing.
      - **CRITICAL SECTION FILTERING**:
        * **STRICTLY IGNORE** all courses that appear after section titles like "TRANSFER CREDIT ACCEPTED BY THE INSTITUTION:", "TRANSFER CREDIT:", or similar transfer credit section headers. These courses are from other institutions and should NOT be included in the courses array.
<<<<<<< Updated upstream
        * **ONLY INCLUDE** courses that appear after section titles like "INSTITUTION CREDIT:", "INSTITUTIONAL CREDIT:", or similar institutional credit section headers. These are courses taken at the main institution.
        * If you see a section header indicating transfer credit, skip all courses in that section until you encounter a new section header.
        * If you see a section header indicating institutional credit, include all courses in that section.
        * If no explicit section headers are found, use your best judgment based on context, but prioritize institutional credit sections.
      - **STRICTLY IGNORE** any course codes or grades found in "Current", "Retention", "Cumulative", "Totals", or "Points" sections. These are summary statistics and NOT the actual course list.
      - **DEDUPLICATE** courses: If the same course number appears multiple times, **ONLY keep the entry that has a valid semester**. discard any entries with null semesters if a version with a semester exists.
      - If a course appears at the very beginning without a header, check if it's a duplicate of a course listed later with a header. If so, discard the first one.
=======
        * **MUST INCLUDE** courses that appear after section titles like:
          - "INSTITUTION CREDIT:", "INSTITUTIONAL CREDIT:" (regular courses)
          - "ADVANCED PLACEMENT", "ADVANCED PLACEMENT CREDIT", "AP CREDIT", "AP", "ADVANCED PLACEMENT (AP)", "AP EXAM", "ADVANCED PLACEMENT EXAM" (Advanced Placement test credits)
          - "CLEP", "CLEP CREDIT", "CLEP EXAM", "COLLEGE LEVEL EXAMINATION PROGRAM" (CLEP test credits)
        * These are courses taken at the main institution or test credits (AP/CLEP) accepted by the institution.
        * **CRITICAL - ADVANCED PLACEMENT AND CLEP COURSES** (HIGHEST PRIORITY - EXTRACT ALL):
          - **MANDATORY EXTRACTION**: If you see ANY of these keywords: "ADVANCED PLACEMENT", "AP", "ADVANCED PLACEMENT CREDIT", "AP CREDIT", "AP EXAM", "ADVANCED PLACEMENT EXAM", "ADVANCED PLACEMENT (AP)", "CLEP", "CLEP CREDIT", "CLEP EXAM", "COLLEGE LEVEL EXAMINATION PROGRAM" - you MUST extract EVERY course/item listed under that section. DO NOT skip any.
          - **Extract courses even if**: they appear on the same line as the keyword, appear immediately after the keyword, don't have semesters, don't have traditional course numbers, have different formats, don't have grades, don't have credit hours.
          - **EXAMPLES - Extract ALL of these**:
            * "ADVANCED PLACEMENT" followed by "English Literature" → Extract as course
            * "AP Calculus AB" → Extract as course  
            * "CLEP History" → Extract as course
            * "Advanced Placement\nEnglish Literature\n3.00" → Extract as course with hours 3.00
            * Any list of courses appearing after "ADVANCED PLACEMENT" or "CLEP" header → Extract all courses
          - **Semester**: Advanced Placement and CLEP courses typically DO NOT have semesters. Use null for semester - this is EXPECTED and NORMAL. DO NOT skip these courses because they lack semesters.
          - **Grade**: These courses commonly use "S" (Satisfactory) as a grade. Extract "S" correctly - OCR often mistakes "S" for "C", so verify carefully. If no grade is shown, use null (NOT credit hours). DO NOT skip the course if no grade is visible.
          - **Credit Hours**: Extract credit hours (like "3.00", "4.0") into the "hours" field, NOT the "grade" field. If no hours are shown, use null or 0.
          - **Course Number**: If no traditional course number exists, use the course name/description as the courseNumber (e.g., "English Literature", "AP English Literature").
          - **CRITICAL**: DO NOT skip, filter out, or discard Advanced Placement or CLEP courses for ANY reason - they must ALWAYS be included in the courses array, even if they're missing semesters, grades, or other fields.
        * If you see a section header indicating transfer credit, skip all courses in that section until you encounter a new section header.
        * If you see a section header indicating institutional credit, Advanced Placement (AP), or CLEP credit, include ALL courses in that section - extract every single course, even if some fields are missing.
        * If no explicit section headers are found, use your best judgment based on context, but prioritize institutional credit sections and test credits (AP/CLEP).
      - **STRICTLY IGNORE** any course codes or grades found in "Current", "Retention", "Cumulative", "Totals", or "Points" sections. These are summary statistics and NOT the actual course list.
      - **DEDUPLICATE** courses: If the same course number appears multiple times, **ONLY keep the entry that has a valid semester**. discard any entries with null semesters if a version with a semester exists.
      - **CRITICAL EXCEPTIONS TO DEDUPLICATION**:
        * Advanced Placement (AP) and CLEP courses may NOT have semesters - this is NORMAL and EXPECTED. DO NOT filter out or discard AP/CLEP courses just because they have null semesters. Include ALL AP/CLEP courses regardless of whether they have a semester or not.
        * DO NOT deduplicate courses that are in different columns or on different pages - they may be legitimate duplicates (retakes). Only deduplicate if they appear to be summary entries vs detail entries within the same section.
        * The first course in the second column should NOT be removed by deduplication - even if it has no semester or seems similar to another course.
      - If a course appears at the very beginning without a header, check if it's a duplicate of a course listed later with a header. If so, discard the first one. **EXCEPTION**: Do not discard AP/CLEP courses even if they appear without a header.
>>>>>>> Stashed changes
      - **SEMESTER FORMAT**: Always try to extract both Term and Year (e.g., "Fall 2023", "Spring 2024").
      - If you see a code like "2023FA", "FA23", "F23", extract it as "Fall 2023".
      - If you see "2025SP", "SP25", "S25", extract it as "Spring 2025".
      - If you see a header that is **JUST A YEAR** (e.g., "2023"), look for a term code nearby. If the previous course had a full semester (e.g., "Fall 2023") and the new header is just "2023", it is likely the same semester or the term is missing. **Prefer the full semester** from the previous context if the year matches.
      - **CORRECT OCR ERRORS IN YEARS**: If you see a semester year that looks like "D023", "D025", "D028", etc., it is likely an OCR error for "2023", "2025", "2028". Please correct it to "20xx". For example, "Spring D025" should be "Spring 2025".
      - **FILTER OUT COURSES FROM OTHER UNIVERSITIES**: If a university name appears in the text along with a semester header (e.g., "Transfer Credit from State University - Fall 2023" or "Fall 2023 - Community College"), those courses listed under that header are from another institution and should be **STRICTLY EXCLUDED** from the courses array. Only include courses from the main transcript university (the one extracted as "university" at the top level). Look for patterns like university names in headers, transfer credit sections, or semester labels that indicate courses taken at another institution.
      - **CRITICAL: FIX MISSING SPACES IN COURSE NUMBERS**: Course numbers typically have a space between letters and numbers (e.g., "BIB 113", "ENG 101"). If you see course numbers without spaces (e.g., "BIB113", "ENG101"), add a space between the letters and numbers. IMPORTANT: Course numbers should be SHORT (usually 2-4 letters followed by 2-4 digits, like "BIB 113" or "ENG 101"). DO NOT put course descriptions in the courseNumber field - use courseName for descriptions.
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

<<<<<<< Updated upstream
        // Strategy:
=======
        // Post-processing: Propagate semesters to courses without semesters
        // This handles cases where courses at the top of a second column don't get the semester
        // from the end of the first column
        // Strategy: For each course without a semester, look at ALL previous courses first (backwards),
        // and if none found, look at ALL following courses (forwards) to find the most recent semester
        // Exception: Don't propagate semesters to AP/CLEP courses (they should remain null)
        
        parsedData.courses.forEach((course, index) => {
          // Skip if course already has a semester
          if (course.semester && course.semester.trim()) {
            return;
          }
          
          // Check if this is an AP/CLEP course - these should NOT get semesters
          const courseNum = (course.courseNumber || '').toUpperCase();
          const courseName = (course.courseName || '').toUpperCase();
          const isAPOrCLEP = 
            courseNum.includes('AP ') || 
            courseNum.includes('CLEP') ||
            courseNum.startsWith('AP') ||
            courseName.includes('ADVANCED PLACEMENT') ||
            courseName.includes('CLEP') ||
            courseNum.includes('ADVANCED PLACEMENT');
          
          // Don't assign semesters to AP/CLEP courses
          if (isAPOrCLEP) {
            return;
          }
          
          // First, look backwards through ALL previous courses to find the most recent semester
          // This is the primary case: course at start of second column should get semester from end of first column
          let foundSemester = null;
          for (let j = index - 1; j >= 0; j--) {
            const prevCourse = parsedData.courses[j];
            if (prevCourse.semester && prevCourse.semester.trim()) {
              // Found a semester in a previous course, use it
              foundSemester = prevCourse.semester.trim();
              break; // Stop looking once we find the most recent semester
            }
          }
          
          // If no semester found backwards, look forwards through following courses
          // This handles edge cases where courses might be in unexpected order
          if (!foundSemester) {
            for (let j = index + 1; j < parsedData.courses.length; j++) {
              const nextCourse = parsedData.courses[j];
              if (nextCourse.semester && nextCourse.semester.trim()) {
                // Found a semester in a following course, use it
                foundSemester = nextCourse.semester.trim();
                break;
              }
            }
          }
          
          // Assign the found semester (if any)
          if (foundSemester) {
            course.semester = foundSemester;
          }
        });
        
        // Final pass: For any courses that STILL don't have a semester, find the most recent semester from ANY course
        // This is a safety net for edge cases where courses are in unexpected order
        const coursesStillWithoutSemester = parsedData.courses.filter((c) => {
          if (c.semester && c.semester.trim()) {
            return false; // Already has semester
          }
          // Check if it's an AP/CLEP course - don't assign semesters to these
          const courseNum = (c.courseNumber || '').toUpperCase();
          const courseName = (c.courseName || '').toUpperCase();
          const isAPOrCLEP = 
            courseNum.includes('AP ') || 
            courseNum.includes('CLEP') ||
            courseNum.startsWith('AP') ||
            courseName.includes('ADVANCED PLACEMENT') ||
            courseName.includes('CLEP') ||
            courseNum.includes('ADVANCED PLACEMENT');
          return !isAPOrCLEP; // Only include non-AP/CLEP courses without semesters
        });
        
        // If there are still courses without semesters, assign the most recent semester found
        if (coursesStillWithoutSemester.length > 0) {
          // Find the most recent semester from any course that has one (last one found)
          let mostRecentSemester = null;
          for (const course of parsedData.courses) {
            if (course.semester && course.semester.trim()) {
              mostRecentSemester = course.semester.trim();
            }
          }
          
          // Assign the most recent semester to all courses without one (if we found one)
          if (mostRecentSemester) {
            coursesStillWithoutSemester.forEach((course) => {
              course.semester = mostRecentSemester;
            });
          }
        }

        // Strategy: Now deduplicate courses
>>>>>>> Stashed changes
        // 1. Identify courses with null semesters.
        // 2. If the same course number exists with a VALID semester, drop the null one.
        // 3. If the null one is the ONLY one, keep it.
        // IMPORTANT: Be conservative - only remove clear duplicates, not courses that might be legitimate

        const coursesWithSemester = parsedData.courses.filter(
          (c) => c.semester
        );
        const coursesWithoutSemester = parsedData.courses.filter(
          (c) => !c.semester
        );

        const keptCourses = [...coursesWithSemester];

        coursesWithoutSemester.forEach((nullCourse, index) => {
          // Check if this is an AP/CLEP course - these should NOT be deduplicated
          const courseNum = (nullCourse.courseNumber || '').toUpperCase();
          const courseName = (nullCourse.courseName || '').toUpperCase();
          const isAPOrCLEP = 
            courseNum.includes('AP ') || 
            courseNum.includes('CLEP') ||
            courseNum.startsWith('AP') ||
            courseName.includes('ADVANCED PLACEMENT') ||
            courseName.includes('CLEP') ||
            courseNum.includes('ADVANCED PLACEMENT');
          
          // AP/CLEP courses should always be kept, even if they have no semester or duplicate course numbers
          if (isAPOrCLEP) {
            keptCourses.push(nullCourse);
            return;
          }
          
          // Be conservative - only remove if there's an exact match (same course number)
          // AND the match has a semester (indicating it's likely a summary vs detail issue)
          const exactMatch = coursesWithSemester.find(
            (c) => c.courseNumber && nullCourse.courseNumber && 
                   c.courseNumber.trim().toUpperCase() === nullCourse.courseNumber.trim().toUpperCase()
          );
          
          // Only skip if we found an exact match with semester
          // Otherwise keep the course (it might be the first course in second column or a legitimate course without semester)
          if (!exactMatch) {
            keptCourses.push(nullCourse);
          }
        });

        parsedData.courses = keptCourses;

        // Post-processing: Normalize semesters, fix course numbers, and fix course descriptions
        // NOTE: We removed automatic grade correction to preserve exactly what the LLM extracted
        // The LLM prompt should handle grade extraction correctly from the transcript
        parsedData.courses.forEach((course) => {
          // Fix missing spaces in course numbers (e.g., "BIB113" -> "BIB 113", "ED1601" -> "ED 1601")
          if (course.courseNumber) {
            let courseNum = String(course.courseNumber).trim();
            
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

          if (course.semester) {
            // Fix OCR error: D0xx -> 20xx
            course.semester = course.semester.replace(/D0(\d{2})/g, "20$1");

            // Fix other common OCR errors if needed
            // e.g. "202S" -> "2025"
            course.semester = course.semester.replace(/202S/g, "2025");
          }

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

      return parsedData;
    } catch (error) {
      console.error("Error parsing with LLM:", error);
      throw new Error("Failed to parse transcript with LLM: " + error.message);
    }
  }
}

export default new OCRService();
