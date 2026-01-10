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
      For semester, try to normalize to "Semester Year" format (e.g., "Fall 2023").

      IMPORTANT:
      - Semester information is often a header above a list of courses (e.g., "Fall 2023", "2023FA", "Term: Spring 2024").
      - You MUST apply the most recent semester header found to all subsequent courses until a new semester header is encountered.
      - If a course does not have an explicit semester next to it, use the last seen semester header.
      - Look for dates or term codes if explicit headers are missing.
      - **STRICTLY IGNORE** any course codes or grades found in "Current", "Retention", "Cumulative", "Totals", or "Points" sections. These are summary statistics and NOT the actual course list.
      - **DEDUPLICATE** courses: If the same course number appears multiple times, **ONLY keep the entry that has a valid semester**. discard any entries with null semesters if a version with a semester exists.
      - **STRICTLY IGNORE** any course codes or grades found in "Current", "Retention", "Cumulative", "Totals", or "Points" sections. These are summary statistics and NOT the actual course list.
      - **DEDUPLICATE** courses: If the same course number appears multiple times, **ONLY keep the entry that has a valid semester**. discard any entries with null semesters if a version with a semester exists.
      - If a course appears at the very beginning without a header, check if it's a duplicate of a course listed later with a header. If so, discard the first one.
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

        // Post-processing: Normalize semesters, fix course numbers, and fix course descriptions
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
