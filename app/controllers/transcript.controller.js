import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import ocrService from "../services/ocrService.js";
import logger from "../config/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const backendRoot = path.resolve(__dirname, "../..");
const transcriptsDir = join(backendRoot, "data/transcripts");

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fs.existsSync(transcriptsDir)) {
      fs.mkdirSync(transcriptsDir, { recursive: true });
    }
    cb(null, transcriptsDir);
  },
  filename: function (req, file, cb) {
    // Get transcriptId from URL params
    const transcriptId = req.params.transcriptId;
    logger.debug(`Transcript ID from params: ${transcriptId}`);

    if (!transcriptId) {
      return cb(new Error("Transcript ID is required"));
    }

    cb(null, `transcript-${transcriptId}.pdf`);
  },
});

// Create multer upload instance
const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    if (file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDF files are allowed"));
    }
    cb(null, true);
  },
}).single("file");

const exports = {};

// Handle file upload
exports.uploadFile = (req, res) => {
  const transcriptId = req.params.transcriptId;
  logger.debug(`Uploading file for transcript: ${transcriptId}`);
  
  upload(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      logger.error(`Multer error uploading file for transcript ${transcriptId}: ${err.message}`);
      return res.status(400).json({ message: err.message });
    } else if (err) {
      logger.error(`Error uploading file for transcript ${transcriptId}: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }

    // Log the request body after multer processes it
    logger.debug(`Request body after upload: ${JSON.stringify(req.body)}`);
    logger.debug(`Uploaded file: ${req.file ? req.file.filename : 'none'}`);

    if (!req.file) {
      logger.warn(`No file uploaded for transcript: ${transcriptId}`);
      return res.status(400).json({ message: "No file uploaded" });
    }

    logger.info(`File uploaded successfully for transcript ${transcriptId}: ${req.file.filename}`);
    res.status(200).json({
      message: "File uploaded successfully",
      filename: req.file.filename,
      transcriptId: transcriptId,
    });
  });
};

exports.processOCR = async (req, res) => {
  const id = req.params.transcriptId;
  try {
    logger.debug(`Processing OCR for transcript: ${id}`);
    
    if (!id) {
      logger.warn("OCR processing attempt without transcript ID");
      return res.status(400).json({ message: "Transcript ID is required" });
    }

    // Find the transcript file
    const filePath = join(transcriptsDir, `transcript-${id}.pdf`);

    if (!fs.existsSync(filePath)) {
      logger.warn(`Transcript file not found: ${filePath}`);
      return res.status(404).json({ message: "No transcript file found" });
    }

    // Read the file
    logger.debug(`Reading transcript file: ${filePath}`);
    const fileBuffer = fs.readFileSync(filePath);

    // Process with OCR
    logger.debug(`Extracting transcript info from PDF for transcript: ${id}`);
    const ocrResults = await ocrService.extractTranscriptInfo(fileBuffer);
    logger.info(`OCR processing completed successfully for transcript: ${id}`);
    res.json(ocrResults);
  } catch (error) {
    logger.error(`Error processing OCR for transcript ${id}: ${error.message}`);
    logger.error(`Error stack: ${error.stack}`);
    
    // Determine status code based on error type
    let statusCode = 500;
    if (error.message && (error.message.includes('overloaded') || error.message.includes('503'))) {
      statusCode = 503; // Service Unavailable
    } else if (error.message && error.message.includes('429')) {
      statusCode = 429; // Too Many Requests
    }
    
    res.status(statusCode).json({ 
      message: error.message || "An error occurred while processing the transcript",
      error: error.message 
    });
  }
};

export default exports;
