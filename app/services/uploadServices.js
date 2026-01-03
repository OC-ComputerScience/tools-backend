const path = require('path');
const fs = require('fs');

// Ensure the transcripts directory exists
const transcriptsDir = path.join(__dirname, '../../data/transcripts');
if (!fs.existsSync(transcriptsDir)) {
  fs.mkdirSync(transcriptsDir, { recursive: true });
}

exports.saveFile = async (file, transcriptId) => {
  try {
    const filePath = path.join(transcriptsDir, `transcript-${transcriptId}.pdf`);
    await fs.promises.writeFile(filePath, file.buffer);
    return filePath;
  } catch (error) {
    console.error('Error saving file:', error);
    throw new Error('Could not save the file: ' + error.message);
  }
}; 