import db from "../models/index.js";
import logger from "../config/logger.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const TranscriptCourse = db.TranscriptCourse;
const UniversityTranscript = db.UniversityTranscript;
const UniversityCourse = db.UniversityCourse;
const Course = db.course;
const Semester = db.Semester;
const PrefixKeyword = db.PrefixKeyword;

const exports = {};

// Initialize Gemini for matching
const getGeminiModel = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in environment variables");
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
};

// Helper function to update transcript status based on courses
const updateTranscriptStatus = async (transcriptId) => {
  try {
    const transcriptCourses = await TranscriptCourse.findAll({
      where: { universityTranscriptId: transcriptId }
    });

    if (transcriptCourses.length === 0) {
      // No courses, status should be "Not Process"
      await UniversityTranscript.update(
        { status: "Not Process" },
        { where: { id: transcriptId } }
      );
      return;
    }

    const allApproved = transcriptCourses.every(
      course => course.status === "Approved"
    );
    const anyApproved = transcriptCourses.some(
      course => course.status === "Approved" || course.status === "Matched"
    );

    let newStatus = "Not Process";
    if (allApproved) {
      newStatus = "Completed";
    } else if (anyApproved) {
      newStatus = "In-Progress";
    }

    await UniversityTranscript.update(
      { status: newStatus },
      { where: { id: transcriptId } }
    );
    
    logger.debug(`Updated transcript ${transcriptId} status to ${newStatus}`);
  } catch (error) {
    logger.error(`Error updating transcript status: ${error.message}`);
  }
};

// Create a new TranscriptCourse
exports.create = async (req, res) => {
  try {
    logger.debug(`Creating transcript course with data: ${JSON.stringify(req.body)}`);
    const transcriptCourse = await TranscriptCourse.create(req.body);
    
    // Update transcript status after course creation
    await updateTranscriptStatus(transcriptCourse.universityTranscriptId);
    
    const createdCourse = await TranscriptCourse.findByPk(
      transcriptCourse.id,
      {
        include: [
          { model: UniversityTranscript },
          { model: UniversityCourse },
          { model: Course, as: 'course' },
          { model: Semester },
        ],
      }
    );
    logger.info(`Transcript course created successfully: ${transcriptCourse.id}`);
    res.status(201).json(createdCourse);
  } catch (error) {
    logger.error(`Error creating transcript course: ${error.message}`);
    logger.error(`Error stack: ${error.stack}`);
    res.status(500).json({ message: error.message });
  }
};

// Get all TranscriptCourses
exports.findAll = async (req, res) => {
  try {
    logger.debug("Fetching all transcript courses");
    const transcriptCourses = await TranscriptCourse.findAll({
      include: [
        { model: UniversityTranscript },
        { model: UniversityCourse },
          { model: Course, as: 'course' },
        { model: Semester },
      ],
    });
    logger.info(`Retrieved ${transcriptCourses.length} transcript courses`);
    res.json(transcriptCourses);
  } catch (error) {
    logger.error(`Error retrieving transcript courses: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

// Get all TranscriptCourses by transcriptId
exports.getByTranscriptId = async (req, res) => {
  const transcriptId = req.params.transcriptId;
  try {
    logger.debug(`Fetching transcript courses for transcript: ${transcriptId}`);
    const transcriptCourses = await TranscriptCourse.findAll({
      where: { universityTranscriptId: transcriptId },
      include: [
        { model: UniversityTranscript },
        { model: UniversityCourse },
          { model: Course, as: 'course' },
        { model: Semester },
      ],
    });
    logger.info(`Retrieved ${transcriptCourses.length} transcript courses for transcript: ${transcriptId}`);
    res.json(transcriptCourses);
  } catch (error) {
    logger.error(`Error retrieving transcript courses for transcript ${transcriptId}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

// Get a single TranscriptCourse by id
exports.findOne = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Finding transcript course with id: ${id}`);
    const transcriptCourse = await TranscriptCourse.findByPk(id, {
      include: [
        { model: UniversityTranscript },
        { model: UniversityCourse },
          { model: Course, as: 'course' },
        { model: Semester },
      ],
    });
    if (!transcriptCourse) {
      logger.warn(`Transcript course not found with id: ${id}`);
      return res.status(404).json({ message: "Transcript Course not found" });
    }
    logger.info(`Transcript course found: ${id}`);
    res.json(transcriptCourse);
  } catch (error) {
    logger.error(`Error retrieving transcript course ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

// Update a TranscriptCourse
exports.update = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Updating transcript course ${id} with data: ${JSON.stringify(req.body)}`);
    const transcriptCourse = await TranscriptCourse.findByPk(id);
    if (!transcriptCourse) {
      logger.warn(`Transcript course not found with id: ${id}`);
      return res.status(404).json({ message: "Transcript Course not found" });
    }
    
    // Ensure transcriptCourse is a Sequelize instance with update method
    if (typeof transcriptCourse.update !== 'function') {
      logger.error(`Invalid transcript course instance for id: ${id}`);
      return res.status(500).json({ message: "Invalid transcript course instance" });
    }
    
    await transcriptCourse.update(req.body);
    
    // Update transcript status after course update
    await updateTranscriptStatus(transcriptCourse.universityTranscriptId);
    
    const updatedCourse = await TranscriptCourse.findByPk(id, {
      include: [
        { model: UniversityTranscript },
        { model: UniversityCourse },
          { model: Course, as: 'course' },
        { model: Semester },
      ],
    });
    
    if (!updatedCourse) {
      logger.warn(`Updated transcript course not found with id: ${id}`);
      return res.status(404).json({ message: "Updated course not found" });
    }
    
    logger.info(`Transcript course ${id} updated successfully`);
    // Ensure we return a plain object (get() converts Sequelize instance to plain object)
    res.json(updatedCourse.get ? updatedCourse.get({ plain: true }) : updatedCourse);
  } catch (error) {
    logger.error(`Error updating transcript course ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

// Delete a TranscriptCourse
exports.delete = async (req, res) => {
  const id = req.params.id;
  try {
    logger.debug(`Attempting to delete transcript course: ${id}`);
    const transcriptCourse = await TranscriptCourse.findByPk(id);
    if (!transcriptCourse) {
      logger.warn(`Transcript course not found with id: ${id}`);
      return res.status(404).json({ message: "Transcript Course not found" });
    }
    const transcriptId = transcriptCourse.universityTranscriptId;
    await transcriptCourse.destroy();
    
    // Update transcript status after course deletion
    await updateTranscriptStatus(transcriptId);
    
    logger.info(`Transcript course ${id} deleted successfully`);
    res.json({ message: "Transcript Course deleted successfully" });
  } catch (error) {
    logger.error(`Error deleting transcript course ${id}: ${error.message}`);
    res.status(500).json({ message: error.message });
  }
};

// Match unmatched transcript courses with generic courses using Gemini
exports.matchGenericCourses = async (req, res) => {
  const transcriptId = req.params.transcriptId;
  
  try {
    logger.debug(`Matching generic courses for transcript: ${transcriptId}`);
    
    // Get all unmatched transcript courses for this transcript
    const unmatchedCourses = await TranscriptCourse.findAll({
      where: {
        universityTranscriptId: transcriptId,
        courseId: null, // Only unmatched courses
      },
      include: [
        { model: Semester },
      ],
    });

    if (unmatchedCourses.length === 0) {
      logger.info(`No unmatched courses found for transcript ${transcriptId}`);
      return res.json({ matches: [], message: "No unmatched courses found" });
    }

    // Get all prefix keywords
    const prefixKeywords = await PrefixKeyword.findAll({
      order: [["prefix", "ASC"]],
    });

    if (prefixKeywords.length === 0) {
      logger.warn("No prefix keywords found in database");
      return res.status(400).json({ message: "No prefix keywords found in database" });
    }

    // Prepare prefix keywords data for Gemini
    const prefixData = prefixKeywords.map(pk => ({
      prefix: pk.prefix,
      keywords: pk.keywords,
    }));

    // Initialize Gemini model
    const model = getGeminiModel();

    const matches = [];
    
    // Process each unmatched course
    for (const transcriptCourse of unmatchedCourses) {
      try {
        const courseDescription = transcriptCourse.courseDescription || '';
        const courseHours = transcriptCourse.courseHours || 0;

        if (!courseDescription) {
          logger.debug(`Skipping course ${transcriptCourse.id} - no description`);
          continue;
        }

        // Use Gemini to find the best matching prefix
        const prompt = `You are a course matching assistant. Given a course description and a list of course prefixes with associated keywords, determine the best matching prefix.

Course Description: "${courseDescription}"
Course Hours: ${courseHours}

Available Prefixes and Keywords:
${prefixData.map(p => `- Prefix: ${p.prefix}, Keywords: ${p.keywords}`).join('\n')}

IMPORTANT MATCHING RULES:
1. **Exact keyword match**: If a word from the course description appears in a prefix's keywords, that's a strong match
2. **Semantic similarity**: Match subjects to their prefix even if words aren't identical:
   - Math/Mathematics subjects (Algebra, Calculus, Geometry, Trigonometry, Statistics, etc.) → MATH prefix
   - Computer Science subjects (Programming, Software, Data, Networks, etc.) → CMSC prefix
   - English/Writing subjects (Composition, Literature, Writing, Grammar, etc.) → ENGL prefix
   - History subjects (History, Historical events, World History, etc.) → HIST prefix (or CHST if church history)
   - Biology subjects (Biology, Anatomy, Physiology, etc.) → BIOL prefix
   - Chemistry subjects → CHEM prefix
   - Physics subjects → PHYS prefix (if available)
   - Education subjects → EDUC prefix
   - Business subjects → BUSA or FINC prefix
3. **Be liberal**: If the course description mentions a subject area that relates to prefix keywords, match it
4. **Word matching**: Look for root words and variations (e.g., "algebraic" matches "algebra", "mathematical" matches "mathematics")
5. **Subject-first approach**: Prioritize the main subject of the course over general terms like "introduction" or "fundamentals"

Your task:
1. Identify the main subject/field of the course from the description
2. Find the prefix whose keywords best represent that subject
3. Return ONLY a valid JSON object with this exact format:
{
  "prefix": "XXXX",
  "confidence": "high|medium|low"
}

If no good match is found, return:
{
  "prefix": null,
  "confidence": "none"
}

Return ONLY the JSON, no other text.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let textResponse = response.text().trim();
        
        // Clean up response (remove markdown if present)
        textResponse = textResponse
          .replace(/```json/g, "")
          .replace(/```/g, "")
          .trim();

        let matchResult;
        try {
          matchResult = JSON.parse(textResponse);
        } catch (parseError) {
          logger.error(`Error parsing Gemini response for course ${transcriptCourse.id}: ${parseError.message}`);
          logger.debug(`Gemini response text: ${textResponse}`);
          continue;
        }

        logger.debug(`Course ${transcriptCourse.id}: Gemini result - prefix: ${matchResult.prefix}, confidence: ${matchResult.confidence}`);

        if (matchResult.prefix && matchResult.confidence !== "none") {
          // Extract numeric portion from transcript course number
          // Course numbers can be like "CMSC-1113", "CMSC 1113", "1113", etc.
          const courseNumberStr = transcriptCourse.courseNumber || '';
          const numericMatch = courseNumberStr.match(/\d+/);
          const numericPortion = numericMatch ? numericMatch[0] : '';
          const firstDigit = numericPortion ? parseInt(numericPortion.charAt(0)) : null;
          
          // Determine pattern based on first digit of numeric portion
          let patternPrefix;
          if (firstDigit === 1 || firstDigit === 2) {
            // Starts with 1 or 2: use XXXX-001H
            patternPrefix = '001';
          } else if (firstDigit === 3 || firstDigit === 4) {
            // Starts with 3 or 4: use XXXX-003H
            patternPrefix = '003';
          } else {
            // Default to 001 if can't determine
            patternPrefix = '001';
            logger.debug(`Course ${transcriptCourse.id}: Could not determine pattern from first digit (${firstDigit}), using default 001`);
          }
          
          // Find generic course with pattern XXXX-00XH where X is pattern (001 or 003) and H is hours
          // The numeric portion should be exactly 4 digits total: pattern (3 digits) + hours (1 digit)
          // e.g., "CMSC-0013" for 3 hours with pattern 001, "CMSC-0034" for 4 hours with pattern 003
          // Note: hours should be a single digit (1-9), not padded
          const hoursDigit = String(courseHours);
          const genericCourseNumber = `${matchResult.prefix}-${patternPrefix}${hoursDigit}`;
          
          logger.info(`Course ${transcriptCourse.id}: Searching for generic course: ${genericCourseNumber} (transcript course: "${courseNumberStr}", first digit: ${firstDigit}, hours: ${courseHours}, pattern: ${patternPrefix})`);
          
          // Also check if we need to look up by code + number separately
          // Course model has code and number fields - generic courses might have code = prefix, number = "0013" etc.
          let genericCourse = await Course.findOne({
            where: {
              number: genericCourseNumber,
            },
          });

          // If not found, try searching by code and number separately
          if (!genericCourse) {
            const courseNumberOnly = `${patternPrefix}${hoursDigit}`;
            genericCourse = await Course.findOne({
              where: {
                code: matchResult.prefix,
                number: courseNumberOnly,
              },
            });
            if (genericCourse) {
              logger.debug(`Course ${transcriptCourse.id}: Found generic course using code+number: ${matchResult.prefix} + ${courseNumberOnly}`);
            }
          }

          // If still not found, try searching by code and number pattern matching
          if (!genericCourse) {
            const courseNumberPattern = `${patternPrefix}${hoursDigit}`;
            // Try to find courses where code matches prefix and number matches pattern
            const allCourses = await Course.findAll({
              where: {
                code: matchResult.prefix,
              },
            });
            logger.debug(`Course ${transcriptCourse.id}: Found ${allCourses.length} courses with code ${matchResult.prefix}, looking for number matching ${courseNumberPattern}`);
            
            genericCourse = allCourses.find(c => {
              // Check if number matches pattern (could be "0013", "CMSC-0013", etc.)
              const num = c.number || '';
              return num.includes(courseNumberPattern) || num === courseNumberPattern;
            });
          }

          if (genericCourse) {
            matches.push({
              transcriptCourseId: transcriptCourse.id,
              courseId: genericCourse.id,
              prefix: matchResult.prefix,
              confidence: matchResult.confidence,
              genericCourseNumber: genericCourseNumber,
              foundCourseNumber: genericCourse.number,
            });
            logger.info(`✓ Matched course ${transcriptCourse.id} ("${courseDescription}") to ${genericCourseNumber} (course ID: ${genericCourse.id}, confidence: ${matchResult.confidence})`);
          } else {
            logger.warn(`✗ Generic course not found: ${genericCourseNumber} for transcript course ${transcriptCourse.id} ("${courseDescription}")`);
          }
        } else {
          logger.debug(`Course ${transcriptCourse.id}: No prefix match found (prefix: ${matchResult.prefix}, confidence: ${matchResult.confidence})`);
        }
      } catch (error) {
        logger.error(`Error matching course ${transcriptCourse.id}: ${error.message}`);
        // Continue with next course
      }
    }

    logger.info(`Found ${matches.length} generic course matches for transcript ${transcriptId} out of ${unmatchedCourses.length} unmatched courses`);
    
    // Include debug info in response for troubleshooting
    const debugInfo = {
      unmatchedCoursesCount: unmatchedCourses.length,
      prefixKeywordsCount: prefixKeywords.length,
      matchesFound: matches.length,
    };
    
    res.json({ matches, message: `Found ${matches.length} matches`, debug: debugInfo });
  } catch (error) {
    logger.error(`Error matching generic courses: ${error.message}`);
    logger.error(`Error stack: ${error.stack}`);
    res.status(500).json({ message: error.message });
  }
};

export default exports;
