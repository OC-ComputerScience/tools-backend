const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ocrService = require('../services/ocrService');

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = 'data/transcripts';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    // Get transcriptId from URL params
    const transcriptId = req.params.transcriptId;
    console.log('Transcript ID from params:', transcriptId);
    
    if (!transcriptId) {
      return cb(new Error('Transcript ID is required'));
    }
    
    cb(null, `transcript-${transcriptId}.pdf`);
  }
});

// Create multer upload instance
const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed'));
    }
    cb(null, true);
  }
}).single('file');

// Handle file upload
exports.uploadFile = (req, res) => {
  upload(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ message: err.message });
    } else if (err) {
      return res.status(500).json({ message: err.message });
    }

    // Log the request body after multer processes it
    console.log('Request body after upload:', req.body);
    console.log('Uploaded file:', req.file);

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    res.status(200).json({ 
      message: 'File uploaded successfully',
      filename: req.file.filename,
      transcriptId: req.params.transcriptId
    });
  });
};

exports.processOCR = async (req, res) => {
  try {
    const id = req.params.transcriptId;
    if (!id) {
      return res.status(400).json({ message: 'Transcript ID is required' });
    }

    // Find the transcript file
    const filePath = path.join('data/transcripts', `transcript-${id}.pdf`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'No transcript file found' });
    }

    // Read the file
    const fileBuffer = fs.readFileSync(filePath);

    // Process with OCR
    const ocrResults = await ocrService.extractTranscriptInfo(fileBuffer);
    res.json(ocrResults);
  } catch (error) {
    console.error('Error processing OCR:', error);
    res.status(500).json({ message: error.message });
  }
};