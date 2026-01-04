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

        // Post-processing: Normalize semesters
        parsedData.courses.forEach((course) => {
          if (course.semester) {
            // Fix OCR error: D0xx -> 20xx
            course.semester = course.semester.replace(/D0(\d{2})/g, "20$1");

            // Fix other common OCR errors if needed
            // e.g. "202S" -> "2025"
            course.semester = course.semester.replace(/202S/g, "2025");
          }
        });
      }

      return parsedData;
    } catch (error) {
      console.error("Error parsing with LLM:", error);
      throw new Error("Failed to parse transcript with LLM: " + error.message);
    }
  }
}

export default new OCRService();
