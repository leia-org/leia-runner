const TranscriptionService = require('../services/transcriptionService');

const transcriptionService = new TranscriptionService();

/**
 * Generate a transcription for a LEIA
 */
module.exports.generateTranscription = async function generateTranscription(req, res) {
  try {
    const { leia } = req.body;

    if (!leia) {
      return res.status(400).send({
        error: 'LEIA object is required'
      });
    }

    // Validate LEIA has required fields for transcription
    if (!leia.spec?.behaviour?.spec?.description) {
      return res.status(400).send({
        error: 'LEIA must have a behaviour description for transcription generation'
      });
    }

    // Generate transcription using the service
    const transcription = await transcriptionService.generateTranscription({ leia });

    res.status(200).send(transcription);

  } catch (error) {
    console.error('Error generating transcription:', error);

    // Handle specific OpenAI API errors
    if (error.message?.includes('API key')) {
      return res.status(401).send({
        error: 'OpenAI API configuration error'
      });
    }

    // Handle validation errors
    if (error.message?.includes('required')) {
      return res.status(400).send({
        error: error.message
      });
    }

    res.status(500).send({
      error: 'Internal error generating transcription',
      details: error.message
    });
  }
};