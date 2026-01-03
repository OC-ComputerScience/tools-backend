const db = require('../models');
const University=db.University;
const UniversityTranscript=db.UniversityTranscript;
const TranscriptCourse=db.TranscriptCourse;
// Create a new UniversityTranscript
exports.create = async (req, res) => {
  try {
    const universityTranscript = await UniversityTranscript.create(req.body);
    res.status(201).json(universityTranscript);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all UniversityTranscripts
exports.findAll = async (req, res) => {
  try {
    const universityTranscripts = await UniversityTranscript.findAll({
      include: [
        { model: University },
        { model: TranscriptCourse }
      ]
    });
    res.json(universityTranscripts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get a single UniversityTranscript by id
exports.findOne = async (req, res) => {
  try {
    const universityTranscript = await UniversityTranscript.findByPk(req.params.id, {
      include: [
        { model: University },
        { model: TranscriptCourse }
      ]
    });
    if (!universityTranscript) {
      return res.status(404).json({ message: 'University Transcript not found' });
    }
    res.json(universityTranscript);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update a UniversityTranscript
exports.update = async (req, res) => {
  try {
    const universityTranscript = await UniversityTranscript.findByPk(req.params.id);
    if (!universityTranscript) {
      return res.status(404).json({ message: 'University Transcript not found' });
    }
    await universityTranscript.update(req.body);
    res.json(universityTranscript);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete a UniversityTranscript
exports.delete = async (req, res) => {
  const { id } = req.params;
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // First, delete all associated transcript courses
    const [transcriptCourses] = await connection.query(
      'SELECT id FROM transcript_courses WHERE university_transcript_id = ?',
      [id]
    );

    if (transcriptCourses.length > 0) {
      const courseIds = transcriptCourses.map(course => course.id);
      await connection.query(
        'DELETE FROM transcript_courses WHERE id IN (?)',
        [courseIds]
      );
    }

    // Then delete the university transcript
    const [result] = await connection.query(
      'DELETE FROM university_transcripts WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'University transcript not found' });
    }

    await connection.commit();
    res.json({ message: 'University transcript and associated courses deleted successfully' });
  } catch (error) {
    await connection.rollback();
    console.error('Error deleting university transcript:', error);
    res.status(500).json({ message: 'Error deleting university transcript' });
  } finally {
    connection.release();
  }
};
